import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';
import { ProcessedContent, Footnote, Citation, ProcessedImage, Equation } from './DocumentProcessor';

export class PdfProcessor {
  /**
   * Process a PDF buffer and extract content
   */
  async processPdf(buffer: Buffer): Promise<ProcessedContent> {
    try {
      console.log('Processing PDF document...');
      
      // Parse PDF content
      const pdfData = await pdfParse(buffer);
      
      console.log(`PDF parsed: ${pdfData.numpages} pages, ${pdfData.text.length} characters`);
      
      // Process the extracted text
      const processedContent = await this.processTextContent(pdfData.text, pdfData.info);
      
      return processedContent;
    } catch (error) {
      console.error('Error processing PDF:', error);
      throw new Error(`Failed to process PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process extracted text content and structure it
   */
  private async processTextContent(text: string, pdfInfo: any): Promise<ProcessedContent> {
    // Clean up text and split into paragraphs
    const cleanText = this.cleanExtractedText(text);
    const paragraphs = this.splitIntoParagraphs(cleanText);
    
    // Extract title from PDF metadata or first significant line
    const title = this.extractTitle(paragraphs, pdfInfo);
    
    // Convert to HTML structure
    const htmlContent = this.convertToHtml(paragraphs);
    
    // Load into cheerio for processing
    const $ = cheerio.load(htmlContent);
    
    // Extract footnotes and citations from the content
    const footnotes = this.extractFootnotesFromText($);
    const citations = this.extractCitationsFromText($);
    const equations = this.extractEquationsFromText($);
    
    // Generate excerpt
    const excerpt = this.generateExcerpt($);
    
    // Count words
    const wordCount = this.countWords($);
    
    return {
      title,
      content: $.html(),
      excerpt,
      footnotes,
      citations,
      images: [], // PDFs don't have embedded images in our current implementation
      equations,
      wordCount
    };
  }

  /**
   * Clean extracted PDF text
   */
  private cleanExtractedText(text: string): string {
    let cleaned = text;
    
    // Remove excessive whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Fix common PDF extraction issues
    cleaned = cleaned.replace(/([a-z])([A-Z])/g, '$1 $2'); // Add space between words that got concatenated
    cleaned = cleaned.replace(/(\d+)\s*\n\s*/g, '$1\n'); // Fix line breaks after numbers
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n'); // Normalize paragraph breaks
    
    // Handle common PDF ligatures and special characters
    cleaned = cleaned.replace(/ﬁ/g, 'fi');
    cleaned = cleaned.replace(/ﬂ/g, 'fl');
    cleaned = cleaned.replace(/ﬀ/g, 'ff');
    cleaned = cleaned.replace(/ﬃ/g, 'ffi');
    cleaned = cleaned.replace(/ﬄ/g, 'ffl');
    
    return cleaned.trim();
  }

  /**
   * Split text into logical paragraphs
   */
  private splitIntoParagraphs(text: string): string[] {
    // Split by double line breaks or clear paragraph indicators
    let paragraphs = text.split(/\n\s*\n/);
    
    // Filter out very short paragraphs that might be artifacts
    paragraphs = paragraphs.filter(p => p.trim().length > 10);
    
    // Further split paragraphs that are too long (might be multiple paragraphs)
    const refinedParagraphs: string[] = [];
    
    for (const para of paragraphs) {
      if (para.length > 1000) {
        // Split long paragraphs by sentence endings followed by capital letters
        const sentences = para.split(/([.!?])\s+(?=[A-Z])/);
        let currentPara = '';
        
        for (let i = 0; i < sentences.length; i += 2) {
          const sentence = sentences[i] + (sentences[i + 1] || '');
          
          if (currentPara.length + sentence.length > 800) {
            if (currentPara.trim()) {
              refinedParagraphs.push(currentPara.trim());
            }
            currentPara = sentence;
          } else {
            currentPara += sentence;
          }
        }
        
        if (currentPara.trim()) {
          refinedParagraphs.push(currentPara.trim());
        }
      } else {
        refinedParagraphs.push(para.trim());
      }
    }
    
    return refinedParagraphs;
  }

  /**
   * Extract title from content or metadata
   */
  private extractTitle(paragraphs: string[], pdfInfo: any): string {
    // Try to get title from PDF metadata
    if (pdfInfo && pdfInfo.Title && pdfInfo.Title.trim()) {
      return pdfInfo.Title.trim();
    }
    
    // Try to extract from first paragraph if it looks like a title
    const firstParagraph = paragraphs[0]?.trim();
    if (firstParagraph && firstParagraph.length < 100 && !firstParagraph.includes('.')) {
      return firstParagraph;
    }
    
    // Look for title-like patterns in first few paragraphs
    for (let i = 0; i < Math.min(3, paragraphs.length); i++) {
      const para = paragraphs[i].trim();
      if (para.length < 80 && para.split(' ').length < 15 && !para.includes('.')) {
        return para;
      }
    }
    
    return 'PDF Document';
  }

  /**
   * Convert paragraphs to HTML
   */
  private convertToHtml(paragraphs: string[]): string {
    let html = '<div class="pdf-content">\n';
    
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed) continue;
      
      // Detect headings (short lines in all caps or title case)
      if (this.isHeading(trimmed)) {
        const level = this.getHeadingLevel(trimmed);
        html += `<h${level}>${this.escapeHtml(trimmed)}</h${level}>\n`;
      } else {
        // Regular paragraph
        let processedPara = this.escapeHtml(trimmed);
        
        // Make text formatting (bold, italic) from common patterns
        processedPara = this.processTextFormatting(processedPara);
        
        html += `<p>${processedPara}</p>\n`;
      }
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Determine if a line is a heading
   */
  private isHeading(text: string): boolean {
    // Short lines that are all caps or title case
    if (text.length < 80 && text.split(' ').length < 12) {
      if (text === text.toUpperCase() || this.isTitleCase(text)) {
        return true;
      }
    }
    
    // Lines that end without punctuation and are relatively short
    if (text.length < 60 && !text.match(/[.!?]$/)) {
      return true;
    }
    
    return false;
  }

  /**
   * Get heading level based on text characteristics
   */
  private getHeadingLevel(text: string): number {
    if (text.length < 30) return 1;
    if (text.length < 50) return 2;
    return 3;
  }

  /**
   * Check if text is in title case
   */
  private isTitleCase(text: string): boolean {
    const words = text.split(' ');
    let titleCaseCount = 0;
    
    for (const word of words) {
      if (word.length > 0 && word[0] === word[0].toUpperCase()) {
        titleCaseCount++;
      }
    }
    
    return titleCaseCount / words.length > 0.7; // 70% of words start with capital
  }

  /**
   * Process text formatting
   */
  private processTextFormatting(text: string): string {
    // Convert asterisks to bold (common in plain text)
    text = text.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    
    // Convert underscores to italic
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    return text;
  }

  /**
   * Extract footnotes from text
   */
  private extractFootnotesFromText($: cheerio.CheerioAPI): Footnote[] {
    const footnotes: Footnote[] = [];
    let footnoteCounter = 1;
    
    // Look for numbered footnotes at the end of the document
    const text = $.text();
    const footnotePattern = /^(\d+)\.\s+(.+)$/gm;
    let match;
    
    while ((match = footnotePattern.exec(text)) !== null) {
      const number = match[1];
      const content = match[2];
      
      footnotes.push({
        id: `footnote-${number}`,
        text: content,
        backRef: `footnote-ref-${number}`
      });
      
      footnoteCounter++;
    }
    
    return footnotes;
  }

  /**
   * Extract citations from text
   */
  private extractCitationsFromText($: cheerio.CheerioAPI): Citation[] {
    const citations: Citation[] = [];
    const text = $.text();
    
    // Look for common citation patterns
    const citationPatterns = [
      /([A-Z][a-z]+,\s[A-Z]\.\s\([12]\d{3}\)\..*?)(?=\n|$)/g, // Author, A. (2023). Title
      /([A-Z][a-z]+\s\([12]\d{3}\)\..*?)(?=\n|$)/g, // Author (2023). Title
      /(References?|Bibliography)\s*\n([\s\S]*?)(?=\n\n|\n[A-Z]|$)/gi // References section
    ];
    
    let citationCounter = 1;
    
    for (const pattern of citationPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const citationText = match[1] || match[2];
        if (citationText && citationText.trim().length > 20) {
          citations.push({
            id: `citation-${citationCounter}`,
            text: citationText.trim(),
            source: this.extractCitationSource(citationText)
          });
          citationCounter++;
        }
      }
    }
    
    return citations;
  }

  /**
   * Extract equations from text
   */
  private extractEquationsFromText($: cheerio.CheerioAPI): Equation[] {
    const equations: Equation[] = [];
    const text = $.text();
    
    // Look for mathematical expressions in the text
    const mathPatterns = [
      /([A-Za-z]\s*=\s*[^.\n]+)/g, // Simple equations like E = mc²
      /(\$[^$]+\$)/g, // LaTeX-style equations
      /([∑∏∫][^.\n]+)/g // Equations with mathematical symbols
    ];
    
    let equationCounter = 1;
    
    for (const pattern of mathPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const equationText = match[1];
        if (equationText && equationText.trim().length > 3) {
          equations.push({
            id: `pdf-equation-${equationCounter}`,
            latex: this.convertToLatex(equationText.trim()),
            display: false
          });
          equationCounter++;
        }
      }
    }
    
    return equations;
  }

  /**
   * Convert mathematical text to LaTeX (simplified version)
   */
  private convertToLatex(text: string): string {
    // Basic LaTeX conversion - reuse logic from DocumentProcessor
    let latex = text.replace(/\s+/g, ' ').trim();
    
    // Basic symbol replacements
    const symbolMap: { [key: string]: string } = {
      '×': '\\times',
      '÷': '\\div',
      '±': '\\pm',
      '≤': '\\leq',
      '≥': '\\geq',
      '≠': '\\neq',
      '∑': '\\sum',
      '∏': '\\prod',
      '∫': '\\int',
      '√': '\\sqrt'
    };
    
    for (const [symbol, latexSymbol] of Object.entries(symbolMap)) {
      latex = latex.replace(new RegExp(symbol, 'g'), latexSymbol);
    }
    
    return latex;
  }

  /**
   * Extract citation source
   */
  private extractCitationSource(text: string): string {
    // Look for year in parentheses
    const yearMatch = text.match(/\((\d{4})\)/);
    if (yearMatch) {
      return yearMatch[1];
    }
    
    // Look for author name
    const authorMatch = text.match(/^([A-Z][a-z]+)/);
    if (authorMatch) {
      return authorMatch[1];
    }
    
    return text.substring(0, 30) + '...';
  }

  /**
   * Generate excerpt
   */
  private generateExcerpt($: cheerio.CheerioAPI): string {
    const text = $.text().trim();
    const words = text.split(/\s+/).slice(0, 55);
    return words.join(' ') + (words.length >= 55 ? '...' : '');
  }

  /**
   * Count words
   */
  private countWords($: cheerio.CheerioAPI): number {
    const text = $.text().trim();
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const div = cheerio.load('<div></div>')('div');
    div.text(text);
    return div.html() || '';
  }
} 