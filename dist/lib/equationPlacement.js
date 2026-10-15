"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRawEquationZones = extractRawEquationZones;
exports.escapeRegExp = escapeRegExp;
exports.buildAnchorPattern = buildAnchorPattern;
exports.placeEquationsInHtml = placeEquationsInHtml;
const ANCHOR_CONTEXT_CHARS = 40;
const MIN_ANCHOR_CHARS = 6;
function decodeXmlEntities(value) {
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
function extractRunText(xmlFragment) {
    let text = '';
    for (const match of xmlFragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) {
        text += decodeXmlEntities(match[1]);
    }
    return text;
}
/** Split raw word/document.xml into its top-level <w:p> paragraph fragments, in order. */
function splitParagraphs(documentXml) {
    return [...documentXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)].map((m) => m[0]);
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
function findZonesInParagraph(paragraphXml) {
    const zoneRe = /<[^:>\s]+:oMathPara\b[^>]*>([\s\S]*?)<\/[^:>\s]+:oMathPara>|<[^:>\s]+:oMath\b[^>]*>([\s\S]*?)<\/[^:>\s]+:oMath>/g;
    const zones = [];
    let match;
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
function extractRawEquationZones(documentXml) {
    const zones = [];
    let precedingParagraphTail = '';
    for (const paragraphXml of splitParagraphs(documentXml)) {
        const paragraphZones = findZonesInParagraph(paragraphXml);
        if (paragraphZones.length === 0) {
            const text = extractRunText(paragraphXml).trim();
            if (text)
                precedingParagraphTail = text;
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
        if (tailText)
            precedingParagraphTail = tailText;
    }
    return zones;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function tail(text, maxChars) {
    return text.length > maxChars ? text.slice(-maxChars) : text;
}
function head(text, maxChars) {
    return text.length > maxChars ? text.slice(0, maxChars) : text;
}
/** Turn plain text into a regex source that tolerates whitespace differences
 *  (Word vs. mammoth's HTML often normalize runs of whitespace differently). */
function toFlexiblePattern(text) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    if (!collapsed)
        return '';
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
function buildAnchorPattern(before, after) {
    const beforeAnchor = toFlexiblePattern(tail(before, ANCHOR_CONTEXT_CHARS));
    const afterAnchor = toFlexiblePattern(head(after, ANCHOR_CONTEXT_CHARS));
    if (beforeAnchor.length + afterAnchor.length < MIN_ANCHOR_CHARS)
        return null;
    const gap = '(?:\\s|<[^>]+>)*';
    if (beforeAnchor && afterAnchor) {
        return new RegExp(`(${beforeAnchor})(${gap})(${afterAnchor})`);
    }
    if (beforeAnchor)
        return new RegExp(`(${beforeAnchor})()()`);
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
function splitGapForInsertion(gap) {
    const closingPrefix = gap.match(/^(?:\s|<\/[^>]+>)*/)?.[0] ?? '';
    return { beforeMarkup: closingPrefix, afterMarkup: gap.slice(closingPrefix.length) };
}
function renderEquationMarkup(latex, display) {
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
function insertAtUniqueMatch(html, pattern, markup) {
    const globalPattern = new RegExp(pattern.source, 'g');
    const matches = [...html.matchAll(globalPattern)];
    if (matches.length !== 1)
        return { html, inserted: false };
    const match = matches[0];
    const start = match.index;
    if (start === undefined)
        return { html, inserted: false };
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
function placeEquationsInHtml(html, equations) {
    let result = html;
    let placedInline = 0;
    const appended = [];
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
        }
        else {
            result = result + appended.join('');
        }
    }
    return { html: result, placedInline, appendedAtEnd: appended.length };
}
//# sourceMappingURL=equationPlacement.js.map