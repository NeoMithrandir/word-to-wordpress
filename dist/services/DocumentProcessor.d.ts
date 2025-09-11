export interface ProcessedContent {
    title: string;
    content: string;
    excerpt: string;
    footnotes: Footnote[];
    citations: Citation[];
    images: ProcessedImage[];
    equations: Equation[];
    wordCount: number;
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
    /**
     * Process a Word document buffer and extract content with formatting
     */
    processDocument(buffer: Buffer): Promise<ProcessedContent>;
    /**
     * Transform document to handle Office Math elements before HTML conversion
     */
    private transformDocumentForEquations;
    /**
     * Process HTML content to extract and organize footnotes, citations, equations, and other elements
     */
    private processHtmlContent;
    /**
     * Extract document title
     */
    private extractTitle;
    /**
     * Extract and process footnotes
     */
    private extractFootnotes;
    /**
     * Extract and process citations
     */
    private extractCitations;
    /**
     * Extract source information from citation text
     */
    private extractCitationSource;
    /**
     * Extract images with metadata
     */
    private extractImages;
    /**
     * Enhance content with WordPress-specific formatting
     */
    private enhanceContent;
    /**
     * Add MathJax support for equation rendering
     */
    private addMathJaxSupport;
    /**
     * Process lists to create proper HTML structure
     */
    private processLists;
    /**
     * Generate excerpt from content
     */
    private generateExcerpt;
    /**
     * Count words in the document
     */
    private countWords;
    /**
     * Extract and process equations
     */
    private extractEquations;
    /**
     * Check if text content appears to be mathematical
     */
    private isMathematicalContent;
    /**
     * Check if Greek letters are used in mathematical context
     */
    private hasGreekInMathContext;
    /**
     * Check if text contains mathematical symbols
     */
    private containsMathematicalSymbols;
    /**
     * Determine if an equation should be displayed as block or inline
     */
    private isDisplayEquation;
    /**
     * Convert mathematical text to LaTeX format
     */
    private convertToLatex;
}
//# sourceMappingURL=DocumentProcessor.d.ts.map