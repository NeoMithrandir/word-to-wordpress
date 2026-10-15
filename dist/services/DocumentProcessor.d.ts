import { type ImageSeoSource } from './ImageSeoService';
export interface ProcessedContent {
    title: string;
    content: string;
    excerpt: string;
    footnotes: Footnote[];
    citations: Citation[];
    images: ProcessedImage[];
    equations: Equation[];
    wordCount: number;
    documentType?: 'word' | 'pdf';
}
export interface Footnote {
    id: string;
    text: string;
    backRef: string;
}
export interface Citation {
    id: string;
    text: string;
    source: string;
}
export interface ProcessedImage {
    id: string;
    /** SEO filename stem (no extension). Internal matching still uses `id`. */
    filename: string;
    alt: string;
    title: string;
    caption?: string;
    seoSource?: ImageSeoSource;
    data: Buffer;
    contentType: string;
}
export interface Equation {
    id: string;
    latex: string;
    display: boolean;
    number?: string;
}
export declare class DocumentProcessor {
    private pdfProcessor;
    constructor();
    /**
     * Main entry point: accept a document buffer (Word or PDF) and return
     * structured content ready for WordPress publishing.
     */
    processDocument(buffer: Buffer, filename?: string): Promise<ProcessedContent>;
    private detectDocumentType;
    /**
     * Convert a .docx buffer to clean HTML.
     * Uses a minimal mammoth styleMap — no equation or WordPress-specific
     * class mappings.
     */
    private processWordDocument;
    /**
     * Master pipeline: extract metadata, link citations, clean markup.
     * Order matters — citation linking adds ids that must survive the
     * subsequent cleanHtml pass.
     */
    private processHtmlContent;
    private extractTitle;
    /**
     * Rewrite footnote AND endnote anchors into the scheme the InScience-v2
     * Astro frontend expects: a literal `[^N]` token in-text, and a note body
     * with `id="fn-N"`. Astro treats every note the same way regardless of
     * whether Word stored it as a footnote (page bottom) or an endnote
     * (document end) — both render identically once published, so both are
     * captured here and share one sequential numbering.
     *
     * Astro's `processFootnotes` only does a plain-text replace of `[^N]`
     * tokens into a styled `<sup>/<a>` at render time — it does not touch
     * the note body at all, so the body must already carry `id="fn-N"` in
     * the published HTML. See src/lib/footnotes.ts for the matching
     * renderer used by this repo's own "Save as HTML" export.
     *
     * Supports three source formats:
     *   • mammoth native footnotes (idPrefix 'doc-'): #doc-footnote-N / doc-footnote-ref-N
     *   • mammoth native endnotes  (idPrefix 'doc-'): #doc-endnote-N  / doc-endnote-ref-N
     *   • Legacy Word HTML:                            #_ftnN
     *
     * Word's own numbering restarts separately for footnotes vs. endnotes, so
     * a document can have both a "footnote 1" and an "endnote 1" with
     * unrelated content. Re-numbering sequentially in document order (rather
     * than reusing Word's per-type ids) keeps every `[^N]` token — and its
     * matching `id="fn-N"` — globally unique.
     *
     * NOTE: We intentionally do NOT use the Word paragraph style "Footnote Text"
     * for detection, because mammoth applies that style to any paragraph bearing
     * it — including quoted / italic passages that were (mis-)styled with it in
     * the original .docx.  Only structurally-linked notes are reliable.
     */
    private extractFootnotes;
    /**
     * Detect the ΒΙΒΛΙΟΓΡΑΦΙΑ (bibliography) section, parse its entries,
     * and turn every in-text "(Author, Year)" occurrence into an anchor
     * link pointing to the matching bibliography entry.
     *
     * Returns the Citation[] metadata array.
     */
    private linkCitations;
    /**
     * Parse a single bibliography line to extract the leading surname
     * and the year.
     *
     * Handles formats like:
     *   "Παπαδόπουλος, Α. (2023). Τίτλος..."
     *   "Smith, J. (1989). Title..."
     *   "Writer (1989) Title..."
     */
    private parseBibEntry;
    /**
     * Normalize a name for anchor-id generation and matching:
     * lowercase → strip combining diacritics → keep only letters & digits.
     */
    private normalizeName;
    /**
     * Extract ALL author surnames from a bibliography entry text.
     * Looks for capitalized words before commas in the author portion
     * (everything before the year).  This lets us index entries by
     * non-first authors too, so "(Lemonde, 1998)" can match an entry
     * that starts with "Laurent, Ph., Lemonde, P., …, 1998."
     */
    private extractAllSurnames;
    /**
     * Walk every text-containing element *before* the bibliography heading
     * and replace "(Author, Year)" patterns with `<a href="#bib-...">` links.
     */
    private linkInTextCitations;
    /**
     * Extract OMath zones by unzipping the .docx with JSZip and reading
     * word/document.xml. This replaces the broken approach of reading the
     * compressed buffer as UTF-8.
     *
     * Returns one zone per equation, each carrying the surrounding paragraph
     * text needed to relocate it in the mammoth-converted HTML later (see
     * src/lib/equationPlacement.ts) — mammoth silently drops OOXML math from
     * its own HTML output, so there is no other trace of where it belongs.
     */
    private extractOMathFromXML;
    /** Strip XML tags from an OMath fragment and reconstruct the expression. */
    private extractMathText;
    /** Basic heuristic to tidy up math text extracted from OMath XML. */
    private reconstructMathExpression;
    /**
     * Convert each equation zone's raw OMath XML to LaTeX, then splice it
     * back into `html` near the text it originally sat next to (see
     * src/lib/equationPlacement.ts) instead of appending everything at the
     * very end of the article.
     *
     * Inline equations (a bare <m:oMath> within a sentence) render as `$...$`
     * so they stay inline and compact; display equations (from <m:oMathPara>,
     * or standalone in their own paragraph) render as their own `<p>$$...$$</p>`.
     * Any LaTeX already present in the body as $...$ / $$...$$ text is left
     * untouched — it will render naturally via the WP plugin.
     *
     * An equation whose surrounding text can't be found (or matches more
     * than once, which is too ambiguous to guess) still gets appended at the
     * end — the previous, always-safe-but-unpositioned behavior — so nothing
     * is ever silently dropped.
     */
    private placeEquations;
    /**
     * Extract base64-embedded images and derive SEO filename / alt / title
     * from nearby document text. Internal ids stay `image-N`.
     */
    private extractImages;
    private findImgByDataUri;
    private findNearestHeading;
    private findFollowingCaption;
    /**
     * Strip all unnecessary markup so the output is WPBakery-friendly:
     *
     *   • No classes
     *   • No scripts or styles
     *   • No id attributes except those needed for citation / footnote anchoring
     *   • No empty paragraphs
     *   • No data-* attributes
     *
     * Preserved:
     *   <a>, <sub>, <sup>, <strong>, <em>, <u>, headings, lists,
     *   blockquotes, tables, images, and LaTeX delimiters in text.
     */
    private cleanHtml;
    /**
     * Group consecutive orphaned <li> elements into proper <ul> wrappers.
     * mammoth may output bare <li> elements without a parent list.
     */
    private processLists;
    private generateExcerpt;
    private countWords;
    /**
     * Convert extracted mathematical text (from OMath XML) into LaTeX
     * notation.  Handles Unicode symbols, fractions, sub/superscripts,
     * roots, named functions, integrals, limits, and matrices.
     */
    private convertToLatex;
}
//# sourceMappingURL=DocumentProcessor.d.ts.map