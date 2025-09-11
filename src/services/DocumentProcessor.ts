import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import { PdfProcessor } from './PdfProcessor';

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

export class DocumentProcessor {
  private pdfProcessor: PdfProcessor;

  constructor() {
    this.pdfProcessor = new PdfProcessor();
  }

  /**
   * Process a document buffer (Word or PDF) and extract content with formatting
   */
  async processDocument(buffer: Buffer, filename?: string): Promise<ProcessedContent> {
    try {
      // Detect document type
      const documentType = this.detectDocumentType(buffer, filename);
      console.log(`Detected document type: ${documentType}`);

      if (documentType === 'pdf') {
        const result = await this.pdfProcessor.processPdf(buffer);
        return {
          ...result,
          documentType: 'pdf'
        };
      } else {
        const result = await this.processWordDocument(buffer);
        return {
          ...result,
          documentType: 'word'
        };
      }
    } catch (error) {
      console.error('Error processing document:', error);
      throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect document type from buffer and filename
   */
  private detectDocumentType(buffer: Buffer, filename?: string): 'word' | 'pdf' {
    // Check filename extension first
    if (filename) {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'docx' || ext === 'doc') return 'word';
    }

    // Check magic bytes/file signature
    const header = buffer.toString('hex', 0, 8).toLowerCase();
    
    // PDF signature: %PDF
    if (buffer.toString('ascii', 0, 4) === '%PDF') {
      return 'pdf';
    }
    
    // Word document signatures
    // DOCX files start with PK (ZIP file format)
    if (header.startsWith('504b0304') || header.startsWith('504b0506') || header.startsWith('504b0708')) {
      return 'word';
    }
    
    // DOC files have a specific signature
    if (header.startsWith('d0cf11e0a1b11ae1')) {
      return 'word';
    }

    // Default to word if uncertain
    console.warn('Could not determine document type, defaulting to Word');
    return 'word';
  }

  /**
   * Process a Word document buffer and extract content with formatting
   */
  private async processWordDocument(buffer: Buffer): Promise<ProcessedContent> {
    try {
      // Configure mammoth options for better HTML output with equation support
      const options = {
        styleMap: [
          // Preserve heading styles
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Heading 5'] => h5:fresh",
          "p[style-name='Heading 6'] => h6:fresh",
          
          // Preserve text formatting
          "b => strong",
          "i => em",
          "u => u",
          
          // Preserve lists
          "p[style-name='List Paragraph'] => li:fresh",
          
          // Preserve quotes
          "p[style-name='Quote'] => blockquote > p:fresh",
          
          // Preserve code blocks
          "p[style-name='Code'] => pre:fresh",
          
          // Custom styles for footnotes and citations
          "p[style-name='Footnote Text'] => p.footnote-text:fresh",
          "p[style-name='Citation'] => p.citation:fresh",
          
          // Equation styles - handle common equation style names
          "p[style-name='Equation'] => div.equation-display:fresh",
          "p[style-name='Inline Equation'] => span.equation-inline:fresh",
          "p[style-name='Math'] => span.math-inline:fresh",
          "p[style-name='Display Math'] => div.math-display:fresh",
          
          // Common equation style names in Word
          "p[style-name='Equation 1'] => div.equation-display:fresh",
          "p[style-name='Equation 2'] => div.equation-display:fresh",
          "p[style-name='Equation 3'] => div.equation-display:fresh"
        ],
        convertImage: mammoth.images.imgElement((image: any) => {
          return image.read("base64").then((imageBuffer: string) => {
            return {
              src: `data:${image.contentType};base64,${imageBuffer}`,
              alt: image.altText || "Document image"
            };
          });
        }),
        includeDefaultStyleMap: true,
        // Preserve raw XML for better equation handling
        preserveEmptyParagraphs: true,
        idPrefix: "doc-"
      };

      // First, try to extract raw XML to find OMath elements
      const rawXmlEquations = await this.extractOMathFromXML(buffer);

      // Convert document to HTML
      const result = await mammoth.convertToHtml({ buffer }, options);
      
      if (result.messages.length > 0) {
        console.log('Mammoth conversion messages:', result.messages);
        // Filter out the OMath warnings since we'll handle them separately
        const filteredMessages = result.messages.filter(msg => 
          !msg.message.includes('oMath') && !msg.message.includes('oMathPara')
        );
        if (filteredMessages.length > 0) {
          console.log('Other conversion messages:', filteredMessages);
        }
      }

      // Process the HTML content
      const processedContent = await this.processHtmlContent(result.value, rawXmlEquations);
      
      return processedContent;
    } catch (error) {
      console.error('Error processing Word document:', error);
      throw new Error(`Failed to process Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process HTML content to extract and organize footnotes, citations, equations, and other elements
   */
  private async processHtmlContent(html: string, rawXmlEquations: string[]): Promise<ProcessedContent> {
    const $ = cheerio.load(html);
    
    // Extract title (first h1 or first paragraph if no h1)
    const title = this.extractTitle($);
    
    // Extract and process footnotes
    const footnotes = this.extractFootnotes($);
    
    // Extract and process citations
    const citations = this.extractCitations($);
    
    // Extract and process equations
    const equations = this.extractEquations($, rawXmlEquations);
    
    // Extract images with metadata
    const images = this.extractImages($);
    
    // Clean and enhance the content
    this.enhanceContent($);
    
    // Generate excerpt
    const excerpt = this.generateExcerpt($);
    
    // Count words
    const wordCount = this.countWords($);
    
    // Get final cleaned HTML
    const content = $.html();
    
    return {
      title,
      content,
      excerpt,
      footnotes,
      citations,
      images,
      equations,
      wordCount
    };
  }

  /**
   * Extract document title
   */
  private extractTitle($: cheerio.CheerioAPI): string {
    // Try to find title in various ways
    let title = $('h1').first().text().trim();
    
    if (!title) {
      // Try first paragraph if it looks like a title
      const firstP = $('p').first().text().trim();
      if (firstP && firstP.length < 100 && !firstP.includes('.')) {
        title = firstP;
        $('p').first().remove(); // Remove it from content
      }
    }
    
    return title || 'Untitled Document';
  }

  /**
   * Extract and process footnotes
   */
  private extractFootnotes($: cheerio.CheerioAPI): Footnote[] {
    const footnotes: Footnote[] = [];
    let footnoteCounter = 1;
    
    // Look for footnote references in the text
    $('a[href^="#_ftn"]').each((index, element) => {
      const $el = $(element);
      const href = $el.attr('href');
      const footnoteId = href?.replace('#_ftn', '') || footnoteCounter.toString();
      
      // Create footnote reference
      const footnoteRef = `footnote-${footnoteId}`;
      $el.attr('href', `#${footnoteRef}`);
      $el.attr('id', `footnote-ref-${footnoteId}`);
      $el.addClass('footnote-ref');
      
      footnoteCounter++;
    });
    
    // Look for footnote text
    $('div[id^="_ftn"], p.footnote-text').each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      
      if (text) {
        const footnoteId = $el.attr('id')?.replace('_ftn', '') || (index + 1).toString();
        
        footnotes.push({
          id: `footnote-${footnoteId}`,
          text: text,
          backRef: `footnote-ref-${footnoteId}`
        });
        
        // Replace with proper footnote HTML
        $el.replaceWith(`
          <div id="footnote-${footnoteId}" class="footnote">
            <p>${text} <a href="#footnote-ref-${footnoteId}" class="footnote-backref">↩</a></p>
          </div>
        `);
      }
    });
    
    return footnotes;
  }

  /**
   * Extract and process citations
   */
  private extractCitations($: cheerio.CheerioAPI): Citation[] {
    const citations: Citation[] = [];
    let citationCounter = 1;
    
    // Look for citation patterns
    $('p.citation, p:contains("Bibliography"), p:contains("References")').each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      
      if (text && text.length > 10) {
        const citationId = `citation-${citationCounter}`;
        
        citations.push({
          id: citationId,
          text: text,
          source: this.extractCitationSource(text)
        });
        
        $el.attr('id', citationId);
        $el.addClass('citation');
        
        citationCounter++;
      }
    });
    
    return citations;
  }

  /**
   * Extract source information from citation text
   */
  private extractCitationSource(text: string): string {
    // Simple heuristic to extract source
    const patterns = [
      /(\d{4})\./,  // Year
      /([A-Z][a-z]+,\s[A-Z]\.)/,  // Author pattern
      /"([^"]+)"/,  // Title in quotes
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return text.substring(0, 50) + '...';
  }

  /**
   * Extract images with metadata
   */
  private extractImages($: cheerio.CheerioAPI): ProcessedImage[] {
    const images: ProcessedImage[] = [];
    
    $('img').each((index, element) => {
      const $el = $(element);
      const src = $el.attr('src');
      const alt = $el.attr('alt') || '';
      const title = $el.attr('title') || '';
      
      if (src && src.startsWith('data:')) {
        const imageId = `image-${index + 1}`;
        
        // Extract base64 data and content type
        const matches = src.match(/data:([^;]+);base64,(.+)/);
        if (matches) {
          const contentType = matches[1];
          const base64Data = matches[2];
          
          images.push({
            id: imageId,
            alt: alt,
            title: title,
            data: Buffer.from(base64Data, 'base64'),
            contentType: contentType
          });
          
          // Update image element with proper attributes
          $el.attr('id', imageId);
          $el.addClass('document-image');
        }
      }
    });
    
    return images;
  }

  /**
   * Enhance content with WordPress-specific formatting
   */
  private enhanceContent($: cheerio.CheerioAPI): void {
    // Add WordPress-friendly classes
    $('blockquote').addClass('wp-block-quote');
    $('pre').addClass('wp-block-code');
    $('table').addClass('wp-block-table');
    
    // Add equation-specific classes and styling
    $('.equation-display').addClass('wp-block-equation-display');
    $('.equation-inline').addClass('wp-block-equation-inline');
    $('.math-display').addClass('wp-block-math-display');
    $('.math-inline').addClass('wp-block-math-inline');
    
    // Ensure proper paragraph spacing
    $('p').each((index, element) => {
      const $el = $(element);
      if ($el.text().trim() === '') {
        $el.remove();
      }
    });
    
    // Handle lists properly
    this.processLists($);
    
    // Add MathJax configuration if equations are present
    if ($('.equation-display, .equation-inline, .math-display, .math-inline').length > 0) {
      this.addMathJaxSupport($);
    }
  }

  /**
   * Add MathJax support for equation rendering
   */
  private addMathJaxSupport($: cheerio.CheerioAPI): void {
    // Add MathJax script to head if not already present
    if ($('script[src*="mathjax"]').length === 0) {
      $('head').append(`
        <script type="text/javascript" async
          src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
        <script type="text/javascript" id="MathJax-script" async
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        <script type="text/javascript">
          window.MathJax = {
            tex: {
              inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
              displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
              processEscapes: true,
              processEnvironments: true
            },
            options: {
              ignoreHtmlClass: 'tex2jax_ignore',
              processHtmlClass: 'tex2jax_process'
            }
          };
        </script>
      `);
    }
    
    // Add CSS for equation styling
    if ($('style[data-equation-styles]').length === 0) {
      $('head').append(`
        <style data-equation-styles>
          .equation-display, .math-display {
            text-align: center;
            margin: 1em 0;
            padding: 1em;
            background-color: #f8f9fa;
            border-radius: 4px;
            overflow-x: auto;
          }
          .equation-display-numbered {
            display: flex;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            margin: 1em 0;
            padding: 1em;
            background-color: #f8f9fa;
            border-radius: 4px;
            overflow-x: auto;
          }
          .equation-content {
            flex: 1;
          }
          .equation-number {
            margin-left: 1em;
            font-weight: bold;
            color: #666;
          }
          .equation-inline, .math-inline {
            font-style: italic;
          }
          .wp-block-equation-display, .wp-block-math-display {
            margin: 1.5em 0;
          }
          .wp-block-equation-inline, .wp-block-math-inline {
            display: inline;
          }
        </style>
      `);
    }
  }

  /**
   * Process lists to create proper HTML structure
   */
  private processLists($: cheerio.CheerioAPI): void {
    // Group consecutive list items into proper ul/ol structures
    const listItems = $('li');
    let currentList: cheerio.Cheerio<any> | null = null;
    
    listItems.each((index, element) => {
      const $li = $(element);
      
      if (!currentList) {
        currentList = $('<ul>');
        $li.before(currentList);
      }
      
      currentList.append($li);
      
      // Check if next element is also a list item
      const next = $li.next();
      if (!next.is('li')) {
        currentList = null;
      }
    });
  }

  /**
   * Generate excerpt from content
   */
  private generateExcerpt($: cheerio.CheerioAPI): string {
    const text = $.text().trim();
    const words = text.split(/\s+/).slice(0, 55); // WordPress default excerpt length
    return words.join(' ') + (words.length >= 55 ? '...' : '');
  }

  /**
   * Count words in the document
   */
  private countWords($: cheerio.CheerioAPI): number {
    const text = $.text().trim();
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Extract OMath elements from raw XML
   */
  private async extractOMathFromXML(buffer: Buffer): Promise<string[]> {
    try {
      const xmlString = buffer.toString('utf8');
      const equations: string[] = [];
      
      // Look for OMath elements in the XML
      const omathRegex = /<[^:]*:oMath[^>]*>(.*?)<\/[^:]*:oMath>/gs;
      const omathParaRegex = /<[^:]*:oMathPara[^>]*>(.*?)<\/[^:]*:oMathPara>/gs;
      
      let match;
      
      // Extract OMath elements
      while ((match = omathRegex.exec(xmlString)) !== null) {
        const mathContent = this.extractMathText(match[1]);
        if (mathContent && mathContent.trim()) {
          equations.push(mathContent.trim());
        }
      }
      
      // Extract OMathPara elements
      while ((match = omathParaRegex.exec(xmlString)) !== null) {
        const mathContent = this.extractMathText(match[1]);
        if (mathContent && mathContent.trim()) {
          equations.push(mathContent.trim());
        }
      }
      
      console.log(`Found ${equations.length} equations in raw XML`);
      return equations;
    } catch (error) {
      console.error('Error extracting OMath from XML:', error);
      return [];
    }
  }

  /**
   * Extract text content from OMath XML
   */
  private extractMathText(omathXml: string): string {
    // Remove XML tags and extract text content
    let text = omathXml.replace(/<[^>]*>/g, ' ');
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Try to reconstruct mathematical expressions from common patterns
    text = this.reconstructMathExpression(text);
    
    return text;
  }

  /**
   * Reconstruct mathematical expressions from extracted text
   */
  private reconstructMathExpression(text: string): string {
    // This is a simplified reconstruction - a full implementation would need
    // to parse the OMath XML structure more carefully
    
    // Handle common mathematical patterns
    text = text.replace(/(\w+)\s+(\^|\u005E)\s*(\w+)/g, '$1^$3'); // superscripts
    text = text.replace(/(\w+)\s+(_|\u005F)\s*(\w+)/g, '$1_$3'); // subscripts
    text = text.replace(/\s*\/\s*/g, '/'); // fractions
    text = text.replace(/\s*\+\s*/g, ' + '); // addition
    text = text.replace(/\s*-\s*/g, ' - '); // subtraction
    text = text.replace(/\s*\*\s*/g, ' × '); // multiplication
    text = text.replace(/\s*=\s*/g, ' = '); // equals
    
    return text;
  }

  /**
   * Extract and process equations
   */
  private extractEquations($: cheerio.CheerioAPI, rawXmlEquations: string[] = []): Equation[] {
    const equations: Equation[] = [];
    let equationCounter = 1;
    
    // First, process equations found in raw XML (Word's equation editor)
    for (const rawEquation of rawXmlEquations) {
      const equationId = `xml-equation-${equationCounter}`;
      const latex = this.convertToLatex(rawEquation);
      
      equations.push({
        id: equationId,
        latex: latex,
        display: true // Assume OMath equations are display equations
      });
      
      // Add a placeholder in the HTML for this equation
      $('body').append(`
        <div id="${equationId}" class="equation-display equation-from-xml">
          <div class="equation-content">$$${latex}$$</div>
        </div>
      `);
      
      equationCounter++;
    }
    
    // Process display equations (block-level) - only from proper styling
    $('.equation-display, .math-display').each((index, element) => {
      const $el = $(element);
      
      // Skip if this is already processed from XML
      if ($el.hasClass('equation-from-xml')) {
        return;
      }
      
      const text = $el.text().trim();
      
      if (text) {
        const equationId = `equation-${equationCounter}`;
        const latex = this.convertToLatex(text);
        
        // Try to extract equation number
        const numberMatch = text.match(/\((\d+)\)$/);
        const number = numberMatch ? numberMatch[1] : undefined;
        
        equations.push({
          id: equationId,
          latex: latex,
          display: true,
          number: number
        });
        
        // Replace with MathJax/LaTeX rendering
        const displayClass = number ? 'equation-display-numbered' : 'equation-display';
        $el.replaceWith(`
          <div id="${equationId}" class="${displayClass}">
            <div class="equation-content">$$${latex}$$</div>
            ${number ? `<div class="equation-number">(${number})</div>` : ''}
          </div>
        `);
        
        equationCounter++;
      }
    });
    
    // Process inline equations - only from proper styling
    $('.equation-inline, .math-inline').each((index, element) => {
      const $el = $(element);
      const text = $el.text().trim();
      
      if (text) {
        const equationId = `equation-inline-${equationCounter}`;
        const latex = this.convertToLatex(text);
        
        equations.push({
          id: equationId,
          latex: latex,
          display: false
        });
        
        // Replace with inline MathJax/LaTeX rendering
        $el.replaceWith(`<span id="${equationId}" class="equation-inline">$${latex}$</span>`);
        
        equationCounter++;
      }
    });
    
    console.log(`Extracted ${equations.length} equations total (${rawXmlEquations.length} from XML, ${equations.length - rawXmlEquations.length} from styles)`);
    return equations;
  }

  /**
   * Convert mathematical text to LaTeX format
   */
  private convertToLatex(text: string): string {
    // Remove equation numbers and clean up
    let latex = text.replace(/\(\d+\)$/, '').trim();
    
    // Handle common Word equation artifacts
    latex = latex.replace(/\s+/g, ' '); // normalize whitespace
    latex = latex.replace(/[\u00A0\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]/g, ' '); // remove various unicode spaces
    
    // Common mathematical symbol conversions
    const symbolMap: { [key: string]: string } = {
      '×': '\\times',
      '÷': '\\div',
      '±': '\\pm',
      '∞': '\\infty',
      '≤': '\\leq',
      '≥': '\\geq',
      '≠': '\\neq',
      '≈': '\\approx',
      '∑': '\\sum',
      '∏': '\\prod',
      '∫': '\\int',
      '∂': '\\partial',
      '√': '\\sqrt',
      'α': '\\alpha',
      'β': '\\beta',
      'γ': '\\gamma',
      'δ': '\\delta',
      'ε': '\\epsilon',
      'θ': '\\theta',
      'λ': '\\lambda',
      'μ': '\\mu',
      'π': '\\pi',
      'σ': '\\sigma',
      'φ': '\\phi',
      'ψ': '\\psi',
      'ω': '\\omega',
      'Α': '\\Alpha',
      'Β': '\\Beta',
      'Γ': '\\Gamma',
      'Δ': '\\Delta',
      'Θ': '\\Theta',
      'Λ': '\\Lambda',
      'Π': '\\Pi',
      'Σ': '\\Sigma',
      'Φ': '\\Phi',
      'Ψ': '\\Psi',
      'Ω': '\\Omega',
      '→': '\\rightarrow',
      '←': '\\leftarrow',
      '↔': '\\leftrightarrow',
      '⇒': '\\Rightarrow',
      '⇐': '\\Leftarrow',
      '⇔': '\\Leftrightarrow',
      '∈': '\\in',
      '∉': '\\notin',
      '⊂': '\\subset',
      '⊃': '\\supset',
      '⊆': '\\subseteq',
      '⊇': '\\supseteq',
      '∪': '\\cup',
      '∩': '\\cap',
      '∅': '\\emptyset',
      'ℕ': '\\mathbb{N}',
      'ℤ': '\\mathbb{Z}',
      'ℚ': '\\mathbb{Q}',
      'ℝ': '\\mathbb{R}',
      'ℂ': '\\mathbb{C}',
      '°': '^{\\circ}',
      '∠': '\\angle',
      '⊥': '\\perp',
      '∥': '\\parallel',
      '∴': '\\therefore',
      '∵': '\\because'
    };
    
    // Apply symbol conversions
    for (const [symbol, latexSymbol] of Object.entries(symbolMap)) {
      latex = latex.replace(new RegExp(symbol, 'g'), latexSymbol);
    }
    
    // Handle fractions more intelligently
    // Match patterns like "a/b", "12/34", "(x+1)/(y-2)"
    latex = latex.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}'); // (expr)/(expr)
    latex = latex.replace(/(\w+(?:\^\w+|\^{\w+})?)\s*\/\s*(\w+(?:\^\w+|\^{\w+})?)/g, '\\frac{$1}{$2}'); // simple fractions
    latex = latex.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}'); // numeric fractions
    
    // Handle subscripts and superscripts more carefully
    // Handle patterns like x_2, x_{12}, x^2, x^{-1}
    latex = latex.replace(/(\w+)_\{([^}]+)\}/g, '$1_{$2}'); // already properly formatted
    latex = latex.replace(/(\w+)_(\w+)/g, '$1_{$2}'); // simple subscripts
    latex = latex.replace(/(\w+)\^\{([^}]+)\}/g, '$1^{$2}'); // already properly formatted
    latex = latex.replace(/(\w+)\^(\w+)/g, '$1^{$2}'); // simple superscripts
    latex = latex.replace(/(\w+)\^(-?\d+)/g, '$1^{$2}'); // numeric superscripts
    
    // Handle square roots more intelligently
    latex = latex.replace(/\\sqrt\s*\(([^)]+)\)/g, '\\sqrt{$1}'); // √(expression)
    latex = latex.replace(/\\sqrt\s*([a-zA-Z0-9]+)/g, '\\sqrt{$1}'); // √x
    
    // Handle nth roots
    latex = latex.replace(/(\d+)\\sqrt\{([^}]+)\}/g, '\\sqrt[$1]{$2}');
    
    // Handle common functions with arguments
    const functions = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'exp', 'lim', 'max', 'min', 'arcsin', 'arccos', 'arctan'];
    for (const func of functions) {
      // Handle function(argument) format
      const regex = new RegExp(`\\b${func}\\s*\\(([^)]+)\\)`, 'g');
      latex = latex.replace(regex, `\\${func}($1)`);
      
      // Handle function argument without parentheses (like sin x)
      const regexNoParen = new RegExp(`\\b${func}\\s+([a-zA-Z0-9\\\\{}^_]+)`, 'g');
      latex = latex.replace(regexNoParen, `\\${func} $1`);
    }
    
    // Handle summation and product notations
    latex = latex.replace(/\\sum\s*\(([^)]+)\s+to\s+([^)]+)\)/g, '\\sum_{$1}^{$2}');
    latex = latex.replace(/\\prod\s*\(([^)]+)\s+to\s+([^)]+)\)/g, '\\prod_{$1}^{$2}');
    latex = latex.replace(/\\sum\s*([^{]+)=([^{]+)to([^{]+)/g, '\\sum_{$1=$2}^{$3}');
    
    // Handle integrals
    latex = latex.replace(/\\int\s*([^{]+)\s+d([a-zA-Z])/g, '\\int $1 \\, d$2');
    
    // Handle limits
    latex = latex.replace(/\\lim\s*([^{]+)→([^{]+)/g, '\\lim_{$1 \\to $2}');
    latex = latex.replace(/\\lim\s*([^{]+)\s+approaches\s+([^{]+)/g, '\\lim_{$1 \\to $2}');
    
    // Handle matrices (basic support)
    latex = latex.replace(/\[([^\]]+)\]/g, (match, content) => {
      if (content.includes(';') || content.includes('\\\\')) {
        return `\\begin{bmatrix} ${content.replace(/;/g, '\\\\')} \\end{bmatrix}`;
      }
      return match;
    });
    
    // Handle absolute values and norms
    latex = latex.replace(/\|([^|]+)\|/g, '\\left|$1\\right|');
    
    // Handle floor and ceiling functions
    latex = latex.replace(/⌊([^⌋]+)⌋/g, '\\lfloor $1 \\rfloor');
    latex = latex.replace(/⌈([^⌉]+)⌉/g, '\\lceil $1 \\rceil');
    
    // Clean up excessive spaces
    latex = latex.replace(/\s+/g, ' ').trim();
    
    // Add spacing around operators for better readability
    latex = latex.replace(/([^\\])([\+\-=<>])/g, '$1 $2 ');
    latex = latex.replace(/([\+\-=<>])([^\\])/g, '$1 $2');
    latex = latex.replace(/\s+/g, ' ').trim();
    
    console.log(`Converted "${text}" to LaTeX: "${latex}"`);
    return latex;
  }
} 