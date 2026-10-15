/**
 * Recover each Word equation's approximate original position in the
 * document, so DocumentProcessor can splice it back into the mammoth-
 * converted HTML near the text it actually belongs to, instead of
 * dumping every equation at the very end of the article.
 *
 * mammoth does not render OOXML math (<m:oMath> / <m:oMathPara>) at all —
 * it silently drops those elements from its HTML output — so
 * DocumentProcessor separately walks the raw word/document.xml to find
 * them. This module does that walk and produces enough surrounding-text
 * context to relocate each equation by string-matching against mammoth's
 * output, which has no other trace of where the equation used to be.
 */

export interface RawEquationZone {
  /** Inner XML of the <m:oMath> zone (still needs LaTeX conversion). */
  omathXml: string;
  /** True for a zone that was inside <m:oMathPara> (a block/display
   *  equation in Word); false for a bare inline <m:oMath> within running text. */
  display: boolean;
  /** Plain text immediately before this zone, within the same paragraph. */
  before: string;
  /** Plain text immediately after this zone, within the same paragraph. */
  after: string;
  /**
   * Tail text of the nearest earlier paragraph that has any text at all.
   * Only useful when `before` and `after` are both empty — i.e. this
   * equation is alone in its own paragraph (a display equation on its
   * own line), so there is nothing else in ITS paragraph to anchor against.
   */
  precedingParagraphTail: string;
}

export interface PositionedEquation {
  latex: string;
  display: boolean;
  before: string;
  after: string;
  precedingParagraphTail: string;
}

export interface EquationPlacementResult {
  html: string;
  /** Equations successfully spliced in near their original text. */
  placedInline: number;
  /** Equations with no confident anchor, appended at the end as a fallback
   *  (never dropped, just not perfectly positioned). */
  appendedAtEnd: number;
}

const ANCHOR_CONTEXT_CHARS = 40;
const MIN_ANCHOR_CHARS = 6;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Concatenate every <w:t> run's text within an XML fragment, in order.
 *  Math zones use <m:t> (a different element), so this naturally skips
 *  over any equation content embedded in the same fragment. */
function extractRunText(xmlFragment: string): string {
  let text = '';
  for (const match of xmlFragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) {
    text += decodeXmlEntities(match[1]);
  }
  return text;
}

/** Split raw word/document.xml into its top-level <w:p> paragraph fragments, in order. */
function splitParagraphs(documentXml: string): string[] {
  return [...documentXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
}

interface ZoneSpan {
  start: number;
  end: number;
  omathXml: string;
  display: boolean;
}

/**
 * Find every math zone within one paragraph's raw XML, in document order.
 *
 * An <m:oMathPara> is matched as a single display zone — it wraps one or
 * more <m:oMath> elements, and because this is one global-flagged regex
 * with alternation, `lastIndex` skips past the whole oMathPara span before
 * the next `.exec()` call, so those inner <m:oMath> elements are never
 * separately re-matched as inline equations. (The previous implementation
 * ran two independent regexes — one for oMath, one for oMathPara — over
 * the same XML, which matched every display equation twice: once as the
 * outer oMathPara, once as the oMath it wraps.)
 */
function findZonesInParagraph(paragraphXml: string): ZoneSpan[] {
  const zoneRe =
    /<[^:>\s]+:oMathPara\b[^>]*>([\s\S]*?)<\/[^:>\s]+:oMathPara>|<[^:>\s]+:oMath\b[^>]*>([\s\S]*?)<\/[^:>\s]+:oMath>/g;
  const zones: ZoneSpan[] = [];
  let match: RegExpExecArray | null;
  while ((match = zoneRe.exec(paragraphXml)) !== null) {
    const isDisplay = match[1] !== undefined;
    zones.push({
      start: match.index,
      end: zoneRe.lastIndex,
      omathXml: (isDisplay ? match[1] : match[2]) ?? '',
      display: isDisplay,
    });
  }
  return zones;
}

/**
 * Walk every paragraph in document order, pulling out each math zone plus
 * enough surrounding text to relocate it later.
 */
export function extractRawEquationZones(documentXml: string): RawEquationZone[] {
  const zones: RawEquationZone[] = [];
  let precedingParagraphTail = '';

  for (const paragraphXml of splitParagraphs(documentXml)) {
    const paragraphZones = findZonesInParagraph(paragraphXml);
    if (paragraphZones.length === 0) {
      const text = extractRunText(paragraphXml).trim();
      if (text) precedingParagraphTail = text;
      continue;
    }

    let cursor = 0;
    for (let i = 0; i < paragraphZones.length; i++) {
      const zone = paragraphZones[i];
      const nextStart = paragraphZones[i + 1]?.start ?? paragraphXml.length;
      const before = extractRunText(paragraphXml.slice(cursor, zone.start)).trim();
      const after = extractRunText(paragraphXml.slice(zone.end, nextStart)).trim();
      zones.push({
        omathXml: zone.omathXml,
        display: zone.display,
        before,
        after,
        precedingParagraphTail,
      });
      cursor = zone.end;
    }

    // This paragraph's own trailing text (after its last equation, or the
    // whole paragraph if it had none of its own) becomes the anchor for
    // the *next* standalone-equation paragraph.
    const tailText = extractRunText(paragraphXml.slice(cursor)).trim();
    if (tailText) precedingParagraphTail = tailText;
  }

  return zones;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tail(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(-maxChars) : text;
}

function head(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}

/** Turn plain text into a regex source that tolerates whitespace differences
 *  (Word vs. mammoth's HTML often normalize runs of whitespace differently). */
function toFlexiblePattern(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (!collapsed) return '';
  return collapsed.split(' ').map(escapeRegExp).join('\\s+');
}

/**
 * Build a regex with three capture groups — before-text, gap, after-text —
 * allowing any run of HTML tags or whitespace in the gap, since mammoth may
 * close/reopen an inline formatting tag (<strong>, <em>, …) exactly at the
 * seam where the equation used to be. Always three groups (empty where not
 * applicable) so callers have one uniform shape to destructure.
 *
 * Returns null when there isn't enough anchor text to search for safely.
 */
export function buildAnchorPattern(before: string, after: string): RegExp | null {
  const beforeAnchor = toFlexiblePattern(tail(before, ANCHOR_CONTEXT_CHARS));
  const afterAnchor = toFlexiblePattern(head(after, ANCHOR_CONTEXT_CHARS));
  if (beforeAnchor.length + afterAnchor.length < MIN_ANCHOR_CHARS) return null;

  const gap = '(?:\\s|<[^>]+>)*';
  if (beforeAnchor && afterAnchor) {
    return new RegExp(`(${beforeAnchor})(${gap})(${afterAnchor})`);
  }
  if (beforeAnchor) return new RegExp(`(${beforeAnchor})()()`);
  return new RegExp(`()()(${afterAnchor})`);
}

/**
 * Split a matched gap into the part that belongs immediately before the
 * inserted equation vs. immediately after it.
 *
 * A run of *closing* tags (</strong>, </em>, …) at the start of the gap
 * closes whatever element wrapped the "before" text — that must stay
 * before the equation, or the equation ends up still inside that element
 * (e.g. rendered bold because it never escaped a dangling <strong>).
 * Everything after that — opening tags and any remaining whitespace —
 * opens whatever wraps the "after" text, and belongs after the equation.
 */
function splitGapForInsertion(gap: string): { beforeMarkup: string; afterMarkup: string } {
  const closingPrefix = gap.match(/^(?:\s|<\/[^>]+>)*/)?.[0] ?? '';
  return { beforeMarkup: closingPrefix, afterMarkup: gap.slice(closingPrefix.length) };
}

function renderEquationMarkup(latex: string, display: boolean): string {
  // Inline math always gets a single space on each side, regardless of how
  // the original whitespace around the equation happened to be split
  // between the "before" and "after" text — otherwise the exact position
  // of that whitespace (all before, all after, some of each) is genuinely
  // ambiguous once mammoth has already dropped the equation from between
  // them. A guaranteed single space reads correctly either way; a second
  // adjacent space (if the source text already had one) collapses visually
  // in any browser and does not affect KaTeX rendering.
  return display ? `<p>$$${latex}$$</p>` : ` $${latex}$ `;
}

/**
 * Insert `markup` at the seam matched by `pattern`, but only when that
 * pattern matches EXACTLY once in `html` — an ambiguous anchor (matching
 * more than once) is safer to skip than to guess wrong and misplace an
 * equation into an unrelated paragraph.
 */
function insertAtUniqueMatch(
  html: string,
  pattern: RegExp,
  markup: string
): { html: string; inserted: boolean } {
  const globalPattern = new RegExp(pattern.source, 'g');
  const matches = [...html.matchAll(globalPattern)];
  if (matches.length !== 1) return { html, inserted: false };

  const match = matches[0];
  const start = match.index;
  if (start === undefined) return { html, inserted: false };
  const end = start + match[0].length;
  const before = match[1] ?? '';
  const gap = match[2] ?? '';
  const after = match[3] ?? '';
  const { beforeMarkup, afterMarkup } = splitGapForInsertion(gap);

  return {
    html: html.slice(0, start) + before + beforeMarkup + markup + afterMarkup + after + html.slice(end),
    inserted: true,
  };
}

/**
 * Splice every positioned equation back into `html` near the text it
 * originally sat next to. Falls back to appending at the end — the
 * previous, always-correct-but-unpositioned behavior — for any equation
 * whose anchor is missing, too short, or ambiguous. No equation is ever
 * dropped; at worst it lands where it always used to.
 */
export function placeEquationsInHtml(
  html: string,
  equations: readonly PositionedEquation[]
): EquationPlacementResult {
  let result = html;
  let placedInline = 0;
  const appended: string[] = [];

  for (const equation of equations) {
    const markup = renderEquationMarkup(equation.latex, equation.display);

    const sameParagraphPattern = buildAnchorPattern(equation.before, equation.after);
    if (sameParagraphPattern) {
      const attempt = insertAtUniqueMatch(result, sameParagraphPattern, markup);
      if (attempt.inserted) {
        result = attempt.html;
        placedInline++;
        continue;
      }
    }

    // Standalone equation paragraph (no text of its own on either side):
    // anchor to the nearest earlier paragraph's tail text instead, and
    // land right after it — matching where the equation's own paragraph
    // used to sit.
    if (!equation.before && !equation.after && equation.precedingParagraphTail) {
      const fallbackPattern = buildAnchorPattern(equation.precedingParagraphTail, '');
      if (fallbackPattern) {
        const attempt = insertAtUniqueMatch(result, fallbackPattern, markup);
        if (attempt.inserted) {
          result = attempt.html;
          placedInline++;
          continue;
        }
      }
    }

    appended.push(markup);
  }

  if (appended.length > 0) {
    if (/<\/body>/i.test(result)) {
      result = result.replace(/<\/body>/i, `${appended.join('')}</body>`);
    } else {
      result = result + appended.join('');
    }
  }

  return { html: result, placedInline, appendedAtEnd: appended.length };
}

const PROTECTED_MATH_RE = /\$\$[\s\S]+?\$\$|\$(?!\$)[^$\n]+?\$/g;
const LATEX_COMMAND_RE = /\\[A-Za-z]+/g;
const MATH_ATOM_CHAR_RE = /[A-Za-z0-9=+\-*/^_{}\[\]|.,–—−×÷±≤≥≠≈∞↔→←⇀⇁⇒⇐⇔]/;
const UNICODE_ARROW_TO_LATEX: Record<string, string> = {
  '\u2194': '\\leftrightarrow',
  '\u2192': '\\rightarrow',
  '\u2190': '\\leftarrow',
  '\u21C0': '\\rightharpoonup',
  '\u21C1': '\\rightharpoondown',
  '\u21BD': '\\leftharpoonup',
  '\u21D2': '\\Rightarrow',
  '\u21D0': '\\Leftarrow',
  '\u21D4': '\\Leftrightarrow',
};
const UNICODE_ARROW_CHARS = Object.keys(UNICODE_ARROW_TO_LATEX).join('');
const UNICODE_ARROW_RE = new RegExp(`[${UNICODE_ARROW_CHARS}]`);
const UNICODE_ARROW_MATH_RE = new RegExp(
  `([A-Za-z0-9]|\\\\[A-Za-z]+|[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΛΠΣΦΨΩ])\\s*([${UNICODE_ARROW_CHARS}])\\s*([A-Za-z0-9]|\\\\[A-Za-z]+|[αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΛΠΣΦΨΩ])`,
  'g'
);

function decodeNumericEntity(code: number): string | null {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return null;
  if (code >= 0xd800 && code <= 0xdfff) return null;
  if (code === 8211) return '\u2013';
  if (code === 8212) return '\u2014';
  if (code === 8722) return '-';
  try {
    return String.fromCodePoint(code);
  } catch {
    return null;
  }
}

function decodeNumericEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (full, dec: string) => decodeNumericEntity(Number(dec)) ?? full)
    .replace(/(?<!&)#(\d{2,6});/g, (full, dec: string) => decodeNumericEntity(Number(dec)) ?? full);
}

function dashToMinus(text: string): string {
  return text.replace(/[\u2013\u2014]/g, '-');
}

function unicodeArrowsToLatex(text: string): string {
  let next = text;
  for (const [sym, cmd] of Object.entries(UNICODE_ARROW_TO_LATEX)) {
    next = next.split(sym).join(cmd);
  }
  return next;
}

function hasBareMathSignal(html: string): boolean {
  return html.includes('\\') || html.includes('#') || UNICODE_ARROW_RE.test(html);
}

function expandBareLatexRange(
  html: string,
  start: number,
  end: number
): { start: number; end: number } {
  while (start > 0) {
    const prev = html[start - 1];
    if (prev === '<' || prev === '>') break;
    if (prev === ' ' && start > 1 && MATH_ATOM_CHAR_RE.test(html[start - 2])) {
      start -= 1;
      continue;
    }
    if (MATH_ATOM_CHAR_RE.test(prev) || prev === '\\') {
      start -= 1;
      continue;
    }
    break;
  }
  while (start < end && html[start] === ' ') start += 1;

  while (end < html.length) {
    const next = html[end];
    if (next === '<' || next === '>') break;
    if (next === '\\' && /[A-Za-z]/.test(html[end + 1] || '')) {
      end += 1;
      while (end < html.length && /[A-Za-z]/.test(html[end])) end += 1;
      continue;
    }
    if (next === ' ' && MATH_ATOM_CHAR_RE.test(html[end + 1] || '')) {
      end += 1;
      continue;
    }
    if (MATH_ATOM_CHAR_RE.test(next)) {
      end += 1;
      continue;
    }
    break;
  }
  while (end > start && html[end - 1] === ' ') end -= 1;
  while (end > start && /[.,;:!?]$/.test(html[end - 1])) end -= 1;
  while (start < end && /[.,;:!?]/.test(html[start])) start += 1;
  return { start, end };
}

function mergeRanges(
  ranges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end + 1) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

/**
 * Astro's renderLatexInHtml only turns `$...$` / `$$...$$` (and QuickLaTeX
 * images) into KaTeX. Word often leaks linear/LaTeX math as raw body text
 * (`x\rightarrow y`, `\rightharpoonup`, leftover `&#8211;` / `#8211;`)
 * with no delimiters, so KaTeX never sees it.
 *
 * Wrap those bare command runs in `$...$` and normalize the en-dash
 * entity leftovers. Already-delimited math is left untouched.
 */
export function wrapBareLatexInHtml(html: string): string {
  if (!html) return html;
  if (!hasBareMathSignal(html)) return html;

  let next = html.replace(/\\\[([\s\S]+?)\\\]/g, (_m, tex: string) => `$$${tex}$$`);
  next = next.replace(/\\\((.+?)\\\)/g, (_m, tex: string) => `$${tex}$`);

  const placeholders: string[] = [];
  next = next.replace(PROTECTED_MATH_RE, (block) => {
    placeholders.push(unicodeArrowsToLatex(dashToMinus(decodeNumericEntities(block))));
    return `\u0000MATH${placeholders.length - 1}\u0000`;
  });

  next = decodeNumericEntities(next);

  UNICODE_ARROW_MATH_RE.lastIndex = 0;
  next = next.replace(UNICODE_ARROW_MATH_RE, (_m, left: string, arrow: string, right: string) => {
    const cmd = UNICODE_ARROW_TO_LATEX[arrow] ?? arrow;
    return `$${left} ${cmd} ${right}$`;
  });

  next = next.replace(PROTECTED_MATH_RE, (block) => {
    placeholders.push(unicodeArrowsToLatex(dashToMinus(block)));
    return `\u0000MATH${placeholders.length - 1}\u0000`;
  });

  const ranges: Array<{ start: number; end: number }> = [];
  LATEX_COMMAND_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LATEX_COMMAND_RE.exec(next)) !== null) {
    ranges.push(expandBareLatexRange(next, match.index, match.index + match[0].length));
  }

  const merged = mergeRanges(ranges);
  for (let i = merged.length - 1; i >= 0; i--) {
    const { start, end } = merged[i];
    const slice = next.slice(start, end);
    if (!slice || slice.startsWith('$') || /[<>\u0000]/.test(slice)) continue;
    next = `${next.slice(0, start)}$${unicodeArrowsToLatex(dashToMinus(slice))}$${next.slice(end)}`;
  }

  return next.replace(/\u0000MATH(\d+)\u0000/g, (_m, idx: string) => {
    return placeholders[Number(idx)] ?? '';
  });
}
