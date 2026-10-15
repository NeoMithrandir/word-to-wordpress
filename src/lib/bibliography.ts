import * as cheerio from 'cheerio';

/**
 * Turn parsed bibliography citations into the plain-text numbered format
 * the InScience-v2 Astro frontend expects in the ACF `article_references`
 * field (one `[N] text` line per reference — see Bibliography.astro /
 * parseBibliography in inscience-v2's src/lib/utils.ts).
 *
 * This does NOT touch the in-text "(Author, Year)" anchor links that
 * DocumentProcessor already writes into the body HTML — those keep working
 * as same-page navigation. This is a second, independent representation of
 * the same bibliography, written to ACF so the Astro article page can render
 * its own numbered "Βιβλιογραφία" section with DOI/URL link detection.
 */

export interface BibliographyCitation {
  text: string;
}

export interface LinkedBibliographyCitation {
  id: string;
  text: string;
  source: string;
}

interface BibliographyEntry {
  id: string;
  surname: string;
  year: string;
  text: string;
}

/**
 * True for a standalone bibliography heading, including qualified titles
 * like "ΒΙΒΛΙΟΓΡΑΦΙΑ ΕΛΛΗΝΙΚΗ" / "ΒΙΒΛΙΟΓΡΑΦΙΑ ΞΕΝΟΓΛΩΣΣΗ".
 * Ordinary sentences that merely mention the word are rejected.
 */
export function isBibliographyHeading(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  return /^(?:βιβλιογραφ(?:[ιί]α(?:κές)?|ικές)|bibliography|references|αναφορ[εέ]ς)(?:\s+\S+){0,4}\s*:?\s*$/iu.test(
    trimmed
  );
}

/**
 * Build "[1] first entry\n[2] second entry…" from citations in their
 * original document order. Empty/whitespace-only entries are skipped.
 * Returns an empty string when there is nothing to write (callers should
 * omit the ACF field rather than send blank text).
 */
export function buildNumberedBibliography(
  citations: readonly BibliographyCitation[] | null | undefined
): string {
  if (!citations || citations.length === 0) return '';

  const lines: string[] = [];
  let number = 1;
  for (const citation of citations) {
    const text = citation.text?.trim();
    if (!text) continue;
    lines.push(`[${number}] ${text}`);
    number += 1;
  }

  return lines.join('\n');
}

/**
 * Detect bibliography heading(s), stamp entry ids, and turn in-text
 * "(Author, Year)" mentions before the first heading into `#bib-…` links.
 * Walks every bibliography block so a Greek + foreign-language pair both
 * contribute entries.
 */
export function linkBibliographyCitations(
  $: cheerio.CheerioAPI
): LinkedBibliographyCitation[] {
  const citations: LinkedBibliographyCitation[] = [];

  let bibHeading: cheerio.Cheerio<any> | null = null;
  $('h1, h2, h3, h4, h5, h6, p').each((_, el) => {
    if (bibHeading) return;
    const $el = $(el);
    if (isBibliographyHeading($el.text())) {
      bibHeading = $el;
    }
  });

  if (!bibHeading) {
    console.log('No bibliography section (ΒΙΒΛΙΟΓΡΑΦΙΑ) found');
    return citations;
  }

  console.log('Found bibliography section');

  const entries: BibliographyEntry[] = [];
  let current = (bibHeading as cheerio.Cheerio<any>).next();

  while (current.length > 0) {
    const tag = (current.prop('tagName') || '').toLowerCase();
    const text = current.text().trim();

    if (/^h[1-3]$/.test(tag) && !isBibliographyHeading(text)) break;
    if (isBibliographyHeading(text)) {
      current = current.next();
      continue;
    }

    if (text && text.length > 10) {
      const entry = parseBibEntry(text);
      if (entry) {
        entries.push(entry);
        current.attr('id', entry.id);
        citations.push({
          id: entry.id,
          text: entry.text,
          source: `${entry.surname}, ${entry.year}`,
        });
      }
    }

    current = current.next();
  }

  console.log(`Parsed ${entries.length} bibliography entries`);

  if (entries.length > 0) {
    linkInTextCitations($, entries, bibHeading as cheerio.Cheerio<any>);
  }

  return citations;
}

function parseBibEntry(text: string): BibliographyEntry | null {
  const yearMatch = text.match(/\(?((?:19|20)\d{2})[a-z]?\)?/);
  if (!yearMatch) return null;
  const year = yearMatch[1];

  const surnameMatch = text.match(/^([\p{L}\-']+)/u);
  if (!surnameMatch) return null;
  const surname = surnameMatch[1];

  const normalized = normalizeName(surname);
  const id = `bib-${normalized}-${year}`;

  return { id, surname: normalized, year, text };
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function extractAllSurnames(text: string, year: string): string[] {
  const yearIdx = text.indexOf(year);
  if (yearIdx < 0) return [];

  const authorPart = text.substring(0, yearIdx);
  const surnameRe = /([\p{L}][\p{L}\-']+)\s*,/gu;
  const surnames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = surnameRe.exec(authorPart)) !== null) {
    if (match[1].length > 1) {
      surnames.push(normalizeName(match[1]));
    }
  }

  return [...new Set(surnames)];
}

const YEAR_RE = /(?:19|20)\d{2}[a-z]?/g;

interface InTextCite {
  authors: string;
  year: string;
  /** Author list + year as they appear in the parenthesis (no leading connector). */
  text: string;
}

/**
 * True for parenthetical figure/table pointers like "(βλ. Εικ. 3)".
 * Those must not be treated as bibliographic citations even if a year
 * happens to appear nearby in the same paragraph.
 */
function isFigureLikeParen(content: string): boolean {
  return /^(?:βλ\.?|see|cf\.?)\s*(?:εικ|εικόνα|σχ|σχήμα|fig|figure|πίν|πίνακας)/iu.test(
    content.trim()
  );
}

/**
 * Split one parenthesis body into distinct author–year citations.
 *
 * Handles the shapes this converter actually sees:
 *   Lundmark, 1930, Zwicky, 1933, Zwicky, 1937
 *   Cirelli, M., et al., 2025
 *   Green & Kavanagh, 2021
 *   Drukier et al., 1986
 *   Babcock, 1939; Rubin & Ford, 1970
 *
 * Years are the boundaries. Everything between (or before) a year is that
 * citation's author list, so comma-heavy names stay on the same citation
 * and a later "Surname, Year" starts a new one.
 */
export function splitInTextCitations(content: string): InTextCite[] {
  YEAR_RE.lastIndex = 0;
  const years: Array<{ year: string; index: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = YEAR_RE.exec(content)) !== null) {
    years.push({ year: match[0], index: match.index });
  }
  if (years.length === 0) return [];

  const cites: InTextCite[] = [];
  let cursor = 0;
  for (const y of years) {
    const rawAuthors = content.slice(cursor, y.index);
    const authors = rawAuthors.replace(/^[;,\s]+/, '').replace(/[,\s;]+$/, '');
    if (!authors) {
      cursor = y.index + y.year.length;
      continue;
    }
    const authorAt = content.indexOf(authors, cursor);
    const textStart = authorAt >= 0 ? authorAt : cursor;
    const textEnd = y.index + y.year.length;
    cites.push({
      authors,
      year: y.year,
      text: content.slice(textStart, textEnd).replace(/^[;,\s]+/, ''),
    });
    cursor = textEnd;
  }
  return cites;
}

function lookupEntry(
  lookup: Map<string, BibliographyEntry>,
  authors: string,
  year: string
): BibliographyEntry | undefined {
  const baseYear = year.replace(/[a-z]$/, '');
  const cleaned = authors
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s*et\s+al\.?\s*/gi, ' ')
    .replace(/\s*κ\.?\s*α\.?\s*/gi, ' ')
    .replace(/&amp;/g, ' ')
    .replace(/&/g, ' ')
    .replace(/και/g, ' ')
    .replace(/,/g, ' ');

  const candidates = cleaned
    .split(/\s+/)
    .filter((word: string) => word.length > 1)
    .filter((word: string) => !/^[\p{L}]\.$/u.test(word));

  for (const word of candidates) {
    const entry = lookup.get(`${normalizeName(word)}-${baseYear}`);
    if (entry) return entry;
  }
  return undefined;
}

function linkifyParenCluster(
  content: string,
  lookup: Map<string, BibliographyEntry>
): string | null {
  if (isFigureLikeParen(content)) return null;
  if (!/(?:19|20)\d{2}/.test(content)) return null;

  const cites = splitInTextCitations(content);
  if (cites.length === 0) return null;

  const linked = cites.map((cite) => ({
    ...cite,
    entry: lookupEntry(lookup, cite.authors, cite.year),
  }));
  if (!linked.some((cite) => cite.entry)) return null;

  const only = linked.length === 1 ? linked[0] : undefined;
  const onlyEntry = only?.entry;
  if (only && onlyEntry) {
    const yearAt = content.indexOf(only.year);
    const after = yearAt >= 0 ? content.slice(yearAt + only.year.length) : '';
    return `<a href="#${onlyEntry.id}">(${only.authors}, ${only.year}${after})</a>`;
  }

  let rebuilt = '';
  let cursor = 0;
  for (const cite of linked) {
    const idx = content.indexOf(cite.text, cursor);
    if (idx < 0) continue;
    rebuilt += content.slice(cursor, idx);
    rebuilt += cite.entry
      ? `<a href="#${cite.entry.id}">${cite.text}</a>`
      : cite.text;
    cursor = idx + cite.text.length;
  }
  rebuilt += content.slice(cursor);
  return `(${rebuilt})`;
}

function linkifyCitationHtml(
  html: string,
  lookup: Map<string, BibliographyEntry>
): string {
  const parts = html.split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi);
  return parts
    .map((part) => {
      if (/^<a\b/i.test(part)) return part;
      return part.replace(/\(([^()]*)\)/g, (full, inner: string) => {
        return linkifyParenCluster(inner, lookup) ?? full;
      });
    })
    .join('');
}

function linkInTextCitations(
  $: cheerio.CheerioAPI,
  entries: BibliographyEntry[],
  bibHeading: cheerio.Cheerio<any>
): void {
  const lookup = new Map<string, BibliographyEntry>();
  for (const entry of entries) {
    lookup.set(`${entry.surname}-${entry.year}`, entry);
    for (const surname of extractAllSurnames(entry.text, entry.year)) {
      if (!lookup.has(`${surname}-${entry.year}`)) {
        lookup.set(`${surname}-${entry.year}`, entry);
      }
    }
  }

  const bibHeadingEl = bibHeading[0];
  let reachedBib = false;

  $('p, li, td, th, h1, h2, h3, h4, h5, h6').each((_, el) => {
    if (reachedBib) return;
    if (el === bibHeadingEl) {
      reachedBib = true;
      return;
    }

    const $el = $(el);
    const html = $el.html();
    if (!html) return;

    const replaced = linkifyCitationHtml(html, lookup);
    if (replaced !== html) {
      $el.html(replaced);
    }
  });
}
