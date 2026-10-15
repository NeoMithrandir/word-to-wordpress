import * as cheerio from 'cheerio';
import { isBibliographyHeading } from './bibliography';

/**
 * Footnote token rendering shared between the DocumentProcessor pipeline
 * (which stores the plain `[^N]` token in the WordPress post body) and
 * the local "Save as HTML" export (which never passes through the
 * InScience-v2 Astro renderer, so it must do its own rendering).
 *
 * Astro's `processFootnotes` (inscience-v2 src/lib/utils.ts) converts the
 * same literal `[^N]` token into `<sup class="footnote-ref"><a href="#fn-N"
 * id="fnref-N">N</a></sup>` at render time. Keeping the token in the stored
 * WordPress content (rather than baking in the final `<sup>/<a>` markup)
 * means the live site gets that CSS class fresh from Astro's own render
 * step — word-to-wordpress's `cleanHtml()` strips all `class` attributes
 * before publish, so a class written here would never survive anyway.
 *
 * Astro does NOT invent footnote bodies or stamp their ids. The matching
 * `id="fn-N"` must already be in the HTML we publish, or the in-text
 * `#fn-N` href is a dead link. DocumentProcessor writes mammoth-linked
 * bodies; `stampTypedFootnoteBodies` covers typed "[N] note" lists.
 */

const FOOTNOTE_TOKEN_RE = /\[\^(\d+)\]/g;

/**
 * Turn leftover typed / mammoth-unlinked footnote markers into the
 * literal `[^N]` token Astro's processFootnotes (and renderFootnoteTokens)
 * already understand.
 *
 * Word footnotes that mammoth linked as <a href="#doc-footnote-N"> are
 * rewritten earlier. This pass catches the remaining cases the user
 * actually sees as a plain superscript "[1]":
 *   • <sup>[N]</sup> with no href (typed superscript, or a mammoth miss)
 *   • <sup><a …>[N]</a></sup> whose href we do not recognize
 *   • bare [N] sitting immediately after a word ("ενεργοποιεί[1]")
 *
 * Bibliography lines that start with "[N] Author…" are left alone — those
 * have whitespace (or a tag) before the bracket, not a word character.
 */
export function promotePlainFootnoteMarkers(html: string): string {
  if (!html) return html;

  let out = html.replace(/<sup(?:\s[^>]*)?>\s*\[(\d+)\]\s*<\/sup>/gi, '[^$1]');
  out = out.replace(
    /<sup(?:\s[^>]*)?>\s*<a\b[^>]*>\s*\[(\d+)\]\s*<\/a>\s*<\/sup>/gi,
    '[^$1]'
  );
  out = out.replace(/([^>\s\[])\[(\d+)\]/g, (full, before: string, num: string) => {
    if (before === '^') return full;
    return `${before}[^${num}]`;
  });
  return out;
}

/**
 * Replace every `[^N]` token with a clickable superscript link to `#fn-N`,
 * mirroring exactly what the Astro article page renders. Used only for
 * word-to-wordpress's own local HTML export, where there is no downstream
 * Astro render step to do this.
 */
export function renderFootnoteTokens(html: string): string {
  if (!html) return html;
  return html.replace(FOOTNOTE_TOKEN_RE, (_match, num: string) => {
    return `<sup class="footnote-ref"><a href="#fn-${num}" id="fnref-${num}">${num}</a></sup>`;
  });
}

export interface StampedFootnote {
  id: string;
  text: string;
  backRef: string;
}

/**
 * True for a standalone notes heading (Σημειώσεις / Υποσημειώσεις / Notes).
 * Ordinary sentences that merely mention the word are rejected.
 */
export function isNotesHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  const folded = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ');
  return /^(?:υποσημειωσεισ|σημειωσεισ|παραπομπεσ|footnotes|endnotes|notes)\s*:?\s*$/i.test(
    folded
  );
}

function inTextFootnoteNumbers(html: string): Set<string> {
  const nums = new Set<string>();
  for (const match of html.matchAll(/\[\^(\d+)\]/g)) {
    nums.add(match[1]);
  }
  return nums;
}

function bodyNumberFromText(text: string): { num: string; body: string } | null {
  const bracket = text.match(/^\[(\d+)\]\s+([\s\S]+)/);
  if (bracket) return { num: bracket[1], body: bracket[2].trim() };
  const dotted = text.match(/^(\d+)\.\s+([\s\S]+)/);
  if (dotted) return { num: dotted[1], body: dotted[2].trim() };
  return null;
}

/**
 * Stamp `id="fn-N"` on typed footnote bodies so in-text `[^N]` / Astro
 * `#fn-N` links have a target. Mammoth-linked `li[id=doc-footnote-N]`
 * are already rewritten by extractFootnotes; this covers the common
 * academic-Word case: a Σημειώσεις heading (or a trailing [N] paragraph)
 * that was never a real Word footnote.
 *
 * Bibliography `[N] Author…` lines after a Βιβλιογραφία heading are left
 * alone — those are references, not note bodies.
 */
export function stampTypedFootnoteBodies(
  $: cheerio.CheerioAPI,
  existing: readonly StampedFootnote[] = []
): StampedFootnote[] {
  const footnotes = [...existing];
  const already = new Set(existing.map((note) => note.id));
  const inTextNums = inTextFootnoteNumbers($('body').html() || '');
  if (inTextNums.size === 0) return footnotes;

  let inNotes = false;
  let inBibliography = false;

  $('p, li, h1, h2, h3, h4, h5, h6').each((_, el) => {
    const $el = $(el);
    const tag = (($el.prop('tagName') as string) || '').toLowerCase();
    const text = $el.text().trim();

    if (/^h[1-6]$/.test(tag)) {
      if (isBibliographyHeading(text)) {
        inBibliography = true;
        inNotes = false;
      } else if (isNotesHeading(text)) {
        inNotes = true;
        inBibliography = false;
      } else {
        inNotes = false;
      }
      return;
    }

    if (inBibliography) return;

    const existingId = $el.attr('id') || '';
    if (existingId.startsWith('fn-')) return;

    let num: string | undefined;
    let body = text;
    const parsed = bodyNumberFromText(text);
    if (parsed) {
      num = parsed.num;
      body = parsed.body;
    } else if (inNotes && tag === 'li') {
      const index = $el.prevAll('li').length + 1;
      const asStr = String(index);
      if (inTextNums.has(asStr)) {
        num = asStr;
      }
    }

    if (!num || !inTextNums.has(num)) return;

    const id = `fn-${num}`;
    if (already.has(id) || $(`#${id}`).length) return;

    $el.attr('id', id);
    if ($el.find(`a[href="#fnref-${num}"]`).length === 0) {
      $el.append(` <a href="#fnref-${num}">↩</a>`);
    }
    already.add(id);
    footnotes.push({ id, text: body, backRef: `fnref-${num}` });
  });

  return footnotes;
}
