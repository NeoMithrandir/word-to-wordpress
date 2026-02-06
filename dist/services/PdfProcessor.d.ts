import { ProcessedContent } from './DocumentProcessor';
export declare class PdfProcessor {
    /**
     * Process a PDF buffer and extract content
     */
    processPdf(buffer: Buffer): Promise<ProcessedContent>;
    /**
     * Process extracted text content and structure it
     */
    private processTextContent;
    /**
     * Clean extracted PDF text
     */
    private cleanExtractedText;
    /**
     * Split text into logical paragraphs
     */
    private splitIntoParagraphs;
    /**
     * Extract title from content or metadata
     */
    private extractTitle;
    /**
     * Convert paragraphs to HTML
     */
    private convertToHtml;
    /**
     * Determine if a line is a heading
     */
    private isHeading;
    /**
     * Get heading level based on text characteristics
     */
    private getHeadingLevel;
    /**
     * Check if text is in title case
     */
    private isTitleCase;
    /**
     * Process text formatting
     */
    private processTextFormatting;
    /**
     * Extract footnotes from text
     */
    private extractFootnotesFromText;
    /**
     * Extract citations from text
     */
    private extractCitationsFromText;
    /**
     * Extract equations from text
     */
    private extractEquationsFromText;
    /**
     * Convert mathematical text to LaTeX (simplified version)
     */
    private convertToLatex;
    /**
     * Extract citation source
     */
    private extractCitationSource;
    /**
     * Generate excerpt
     */
    private generateExcerpt;
    /**
     * Count words
     */
    private countWords;
    /**
     * Escape HTML characters
     */
    private escapeHtml;
}
//# sourceMappingURL=PdfProcessor.d.ts.map