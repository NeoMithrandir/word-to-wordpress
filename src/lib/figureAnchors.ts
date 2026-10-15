import * as cheerio from 'cheerio';

const FIGURE_CAPTION_RE =
  /^(?:Εικόνα|Εικ\.?|Σχήμα|Σχ\.?|Figure|Fig\.?)\s*(\d+)\b/iu;

const FIGURE_REF_RE =
  /(?<![\p{L}\p{N}])((?:Εικόνα|Εικ\.?|Σχήμα|Σχ\.?|Figure|Fig\.?)\s*(\d+))/gu;

/**
 * Caption-only helper: "Εικόνα 1. Halo" → "fig-1".
 * Body sentences that merely mention a figure stay unmatched.
 */
export function figureIdFromCaption(text: string): string | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  const match = trimmed.match(FIGURE_CAPTION_RE);
  return match ? `fig-${match[1]}` : null;
}

/**
 * Stamp id="fig-N" on each numbered figure and turn in-text "Εικ. N"
 * (also Εικόνα / Σχήμα / Fig. / Figure) into same-page links.
 */
export function linkFigureReferences($: cheerio.CheerioAPI): void {
  const known = new Set<string>();

  $('img').each((_, el) => {
    const $img = $(el);
    const caption = captionTextForImage($img);
    const id = figureIdFromCaption(caption);
    if (!id || known.has(id) || $(`#${id}`).length) return;

    figureTargetForImage($img).attr('id', id);
    known.add(id);
  });

  $('p, li, td, th, h1, h2, h3, h4, h5, h6').each((_, el) => {
    const $el = $(el);
    if (figureIdFromCaption($el.text())) return;

    const html = $el.html();
    if (!html) return;

    FIGURE_REF_RE.lastIndex = 0;
    const replaced = html.replace(
      FIGURE_REF_RE,
      (full, label: string, num: string, offset: number, source: string) => {
        const id = `fig-${num}`;
        if (!known.has(id)) return full;
        if (isInsideAnchor(source, offset)) return full;
        return `<a href="#${id}">${label}</a>`;
      }
    );

    if (replaced !== html) $el.html(replaced);
  });
}

function captionTextForImage($img: cheerio.Cheerio<any>): string {
  const $figure = $img.closest('figure');
  if ($figure.length) {
    const fromFig = $figure.find('figcaption').first().text().trim();
    if (fromFig) return fromFig;
  }

  const candidates: cheerio.Cheerio<any>[] = [];
  const $next = $img.next();
  if ($next.length) candidates.push($next);

  const $parent = $img.parent();
  if ($parent.length && !$parent.is('body') && !$parent.is('html')) {
    const $parentNext = $parent.next();
    if ($parentNext.length) candidates.push($parentNext);
  }

  for (const $cand of candidates) {
    const text = $cand.text().trim();
    if (figureIdFromCaption(text)) return text;
  }
  return '';
}

function figureTargetForImage($img: cheerio.Cheerio<any>): cheerio.Cheerio<any> {
  const $figure = $img.closest('figure');
  if ($figure.length) return $figure;

  const $parent = $img.parent();
  if ($parent.length && !$parent.is('body') && !$parent.is('html')) {
    return $parent;
  }
  return $img;
}

function isInsideAnchor(html: string, offset: number): boolean {
  const before = html.slice(0, offset);
  const opens = before.match(/<a\b/gi)?.length ?? 0;
  const closes = before.match(/<\/a>/gi)?.length ?? 0;
  return opens > closes;
}
