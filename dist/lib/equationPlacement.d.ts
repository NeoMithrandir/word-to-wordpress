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
/**
 * Walk every paragraph in document order, pulling out each math zone plus
 * enough surrounding text to relocate it later.
 */
export declare function extractRawEquationZones(documentXml: string): RawEquationZone[];
export declare function escapeRegExp(value: string): string;
/**
 * Build a regex with three capture groups — before-text, gap, after-text —
 * allowing any run of HTML tags or whitespace in the gap, since mammoth may
 * close/reopen an inline formatting tag (<strong>, <em>, …) exactly at the
 * seam where the equation used to be. Always three groups (empty where not
 * applicable) so callers have one uniform shape to destructure.
 *
 * Returns null when there isn't enough anchor text to search for safely.
 */
export declare function buildAnchorPattern(before: string, after: string): RegExp | null;
/**
 * Splice every positioned equation back into `html` near the text it
 * originally sat next to. Falls back to appending at the end — the
 * previous, always-correct-but-unpositioned behavior — for any equation
 * whose anchor is missing, too short, or ambiguous. No equation is ever
 * dropped; at worst it lands where it always used to.
 */
export declare function placeEquationsInHtml(html: string, equations: readonly PositionedEquation[]): EquationPlacementResult;
//# sourceMappingURL=equationPlacement.d.ts.map