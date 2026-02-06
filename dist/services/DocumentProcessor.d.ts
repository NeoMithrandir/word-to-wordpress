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
    alt: string;
    title: string;
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
     * Rewrite Word's footnote anchors (#_ftn*) into a clean scheme
     * (footnote-N / footnote-ref-N) and collect footnote text.
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
     * Walk every text-containing element *before* the bibliography heading
     * and replace "(Author, Year)" patterns with `<a href="#bib-...">` links.
     */
    private linkInTextCitations;
    /**
     * Extract OMath elements by unzipping the .docx with JSZip and
     * reading word/document.xml.  This replaces the broken approach of
     * reading the compressed buffer as UTF-8.
     */
    private extractOMathFromXML;
    /** Strip XML tags from an OMath fragment and reconstruct the expression. */
    private extractMathText;
    /** Basic heuristic to tidy up math text extracted from OMath XML. */
    private reconstructMathExpression;
    /**
     * Process equations extracted from the .docx XML and record them
     * as metadata.  Each equation is also appended to the HTML body as
     * a paragraph with $$...$$ delimiters so a MathJax/KaTeX WordPress
     * plugin can render it.
     *
     * Any LaTeX already present in the body as $...$ / $$...$$ text
     * is left untouched — it will render naturally via the WP plugin.
     */
    private extractEquations;
    /**
     * Extract base64-embedded images as metadata (for potential upload
     * to the WordPress media library later).
     */
    private extractImages;
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