"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentProcessor = void 0;
const mammoth_1 = __importDefault(require("mammoth"));
const cheerio = __importStar(require("cheerio"));
class DocumentProcessor {
    /**
     * Process a Word document buffer and extract content with formatting
     */
    async processDocument(buffer) {
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
                    // Equation styles - handle both inline and display equations
                    "p[style-name='Equation'] => div.equation-display:fresh",
                    "p[style-name='Inline Equation'] => span.equation-inline:fresh",
                    "p[style-name='Math'] => span.math-inline:fresh",
                    "p[style-name='Display Math'] => div.math-display:fresh",
                    // Common equation style names in Word
                    "p[style-name='Equation 1'] => div.equation-display:fresh",
                    "p[style-name='Equation 2'] => div.equation-display:fresh",
                    "p[style-name='Equation 3'] => div.equation-display:fresh",
                    // Handle equation objects with specific style names
                    "p[style-name*='equation'] => div.equation-display:fresh",
                    "p[style-name*='math'] => span.math-inline:fresh"
                ],
                convertImage: mammoth_1.default.images.imgElement((image) => {
                    return image.read("base64").then((imageBuffer) => {
                        return {
                            src: `data:${image.contentType};base64,${imageBuffer}`,
                            alt: image.altText || "Document image"
                        };
                    });
                }),
                includeDefaultStyleMap: true,
                // Preserve raw XML for better equation handling
                preserveEmptyParagraphs: true,
                idPrefix: "doc-",
                // Add custom transform to handle Office Math elements
                transformDocument: (document) => {
                    return this.transformDocumentForEquations(document);
                }
            };
            // Convert document to HTML
            const result = await mammoth_1.default.convertToHtml({ buffer }, options);
            if (result.messages.length > 0) {
                console.log('Mammoth conversion messages:', result.messages);
            }
            // Process the HTML content
            const processedContent = await this.processHtmlContent(result.value);
            return processedContent;
        }
        catch (error) {
            console.error('Error processing document:', error);
            throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Transform document to handle Office Math elements before HTML conversion
     */
    transformDocumentForEquations(document) {
        // This is a simplified approach - in a real implementation, you'd need to
        // parse the Office Math XML and convert it to text representation
        // For now, we'll rely on the style-based detection and post-processing
        console.log('Document transformation for equations completed');
        return document;
    }
    /**
     * Process HTML content to extract and organize footnotes, citations, equations, and other elements
     */
    async processHtmlContent(html) {
        const $ = cheerio.load(html);
        // Extract title (first h1 or first paragraph if no h1)
        const title = this.extractTitle($);
        // Extract and process footnotes
        const footnotes = this.extractFootnotes($);
        // Extract and process citations
        const citations = this.extractCitations($);
        // Extract and process equations
        const equations = this.extractEquations($);
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
    extractTitle($) {
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
    extractFootnotes($) {
        const footnotes = [];
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
    extractCitations($) {
        const citations = [];
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
    extractCitationSource(text) {
        // Simple heuristic to extract source
        const patterns = [
            /(\d{4})\./, // Year
            /([A-Z][a-z]+,\s[A-Z]\.)/, // Author pattern
            /"([^"]+)"/, // Title in quotes
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
    extractImages($) {
        const images = [];
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
    enhanceContent($) {
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
    addMathJaxSupport($) {
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
    processLists($) {
        // Group consecutive list items into proper ul/ol structures
        const listItems = $('li');
        let currentList = null;
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
    generateExcerpt($) {
        const text = $.text().trim();
        const words = text.split(/\s+/).slice(0, 55); // WordPress default excerpt length
        return words.join(' ') + (words.length >= 55 ? '...' : '');
    }
    /**
     * Count words in the document
     */
    countWords($) {
        const text = $.text().trim();
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }
    /**
     * Extract and process equations
     */
    extractEquations($) {
        const equations = [];
        let equationCounter = 1;
        // Strategy 1: Process elements with equation-specific classes
        $('.equation-display, .math-display, div[id*="equation"], div[id*="math"]').each((index, element) => {
            const $el = $(element);
            const text = $el.text().trim();
            if (text && this.isMathematicalContent(text)) {
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
        // Strategy 2: Process inline equations
        $('.equation-inline, .math-inline, span[id*="equation"], span[id*="math"]').each((index, element) => {
            const $el = $(element);
            const text = $el.text().trim();
            if (text && this.isMathematicalContent(text)) {
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
        // Strategy 3: Pattern-based detection in paragraphs
        $('p').each((index, element) => {
            const $el = $(element);
            const text = $el.text().trim();
            if (text && this.isMathematicalContent(text) && !$el.hasClass('footnote-text') && !$el.hasClass('citation')) {
                const equationId = `equation-pattern-${equationCounter}`;
                const latex = this.convertToLatex(text);
                const isDisplay = this.isDisplayEquation(text);
                equations.push({
                    id: equationId,
                    latex: latex,
                    display: isDisplay
                });
                // Replace with appropriate rendering
                if (isDisplay) {
                    $el.replaceWith(`
            <div id="${equationId}" class="equation-display">
              <div class="equation-content">$$${latex}$$</div>
            </div>
          `);
                }
                else {
                    $el.replaceWith(`<span id="${equationId}" class="equation-inline">$${latex}$</span>`);
                }
                equationCounter++;
            }
        });
        // Strategy 4: Look for mathematical symbols in any text content
        $('*').each((index, element) => {
            const $el = $(element);
            const text = $el.text().trim();
            // Skip if this element already has equation classes or is a child of an equation
            if ($el.hasClass('equation-display') || $el.hasClass('equation-inline') ||
                $el.hasClass('math-display') || $el.hasClass('math-inline') ||
                $el.parents('.equation-display, .equation-inline, .math-display, .math-inline').length > 0) {
                return;
            }
            if (text && this.containsMathematicalSymbols(text) && text.length < 200) {
                const equationId = `equation-symbol-${equationCounter}`;
                const latex = this.convertToLatex(text);
                const isDisplay = this.isDisplayEquation(text);
                equations.push({
                    id: equationId,
                    latex: latex,
                    display: isDisplay
                });
                // Replace with appropriate rendering
                if (isDisplay) {
                    $el.replaceWith(`
            <div id="${equationId}" class="equation-display">
              <div class="equation-content">$$${latex}$$</div>
            </div>
          `);
                }
                else {
                    $el.replaceWith(`<span id="${equationId}" class="equation-inline">$${latex}$</span>`);
                }
                equationCounter++;
            }
        });
        console.log(`Extracted ${equations.length} equations from document`);
        return equations;
    }
    /**
     * Check if text content appears to be mathematical
     */
    isMathematicalContent(text) {
        // Skip very long text (likely regular paragraphs)
        if (text.length > 300) {
            return false;
        }
        // Skip text that looks like regular paragraphs with too many spaces
        if (text.split(' ').length > 20) {
            return false;
        }
        // Check for mathematical symbols (excluding common Greek letters used in text)
        const mathSymbols = /[×÷±∞≤≥≠≈∑∏∫∂√→←↔⇒⇐⇔∈∉⊂⊃∪∩∅ℕℤℚℝℂ]/;
        // Check for mathematical patterns that are more specific
        const mathPatterns = [
            /\d+\/\d+/, // Fractions
            /\w+_\w+/, // Subscripts
            /\w+\^\w+/, // Superscripts
            /√\([^)]+\)/, // Square roots
            /\b(sin|cos|tan|log|ln|exp|lim)\s*\(/, // Functions
            /[a-zA-Z]\s*=\s*[^=]+/, // Equations with variables
            /\d+\s*[+\-×÷]\s*\d+/, // Basic arithmetic
            /∑|∏|∫/, // Summation, product, integral
            /[≤≥≠≈]/, // Mathematical comparisons
        ];
        // Check for equation-like patterns
        const equationPatterns = [
            /^[a-zA-Z]\s*=\s*/, // Starts with variable assignment
            /^[a-zA-Z]\s*≤\s*/, // Starts with inequality
            /^[a-zA-Z]\s*≥\s*/, // Starts with inequality
            /^√\(/, // Starts with square root
            /^∑/, // Starts with summation
            /^∫/, // Starts with integral
            /^∏/, // Starts with product
            /^\d+\/\d+/, // Starts with fraction
        ];
        // If it has mathematical symbols or specific patterns, it's likely math
        const hasMathSymbols = mathSymbols.test(text);
        const hasMathPatterns = mathPatterns.some(pattern => pattern.test(text));
        const hasEquationPatterns = equationPatterns.some(pattern => pattern.test(text));
        // For Greek letters, only treat as math if they're part of mathematical expressions
        const hasGreekInMathContext = this.hasGreekInMathContext(text);
        return hasMathSymbols || hasMathPatterns || hasEquationPatterns || hasGreekInMathContext;
    }
    /**
     * Check if Greek letters are used in mathematical context
     */
    hasGreekInMathContext(text) {
        // Common Greek letters used in mathematics
        const mathGreekLetters = /[αβγδεθλμπσφψω]/;
        // If no Greek letters, not math
        if (!mathGreekLetters.test(text)) {
            return false;
        }
        // Check if Greek letters are used in mathematical patterns
        const mathGreekPatterns = [
            /[αβγδεθλμπσφψω]\s*[+\-×÷=≤≥]/, // Greek letter followed by operator
            /[+\-×÷=≤≥]\s*[αβγδεθλμπσφψω]/, // Operator followed by Greek letter
            /[αβγδεθλμπσφψω]_\w+/, // Greek letter with subscript
            /[αβγδεθλμπσφψω]\^\w+/, // Greek letter with superscript
            /sin\([αβγδεθλμπσφψω]\)/, // Function with Greek argument
            /cos\([αβγδεθλμπσφψω]\)/, // Function with Greek argument
            /tan\([αβγδεθλμπσφψω]\)/, // Function with Greek argument
            /[αβγδεθλμπσφψω]\s*=\s*/, // Greek letter assignment
        ];
        return mathGreekPatterns.some(pattern => pattern.test(text));
    }
    /**
     * Check if text contains mathematical symbols
     */
    containsMathematicalSymbols(text) {
        // Skip very long text
        if (text.length > 200) {
            return false;
        }
        // Skip text with too many words (likely regular paragraphs)
        if (text.split(' ').length > 15) {
            return false;
        }
        const mathSymbols = /[×÷±∞≤≥≠≈∑∏∫∂√→←↔⇒⇐⇔∈∉⊂⊃∪∩∅ℕℤℚℝℂ]/;
        return mathSymbols.test(text);
    }
    /**
     * Determine if an equation should be displayed as block or inline
     */
    isDisplayEquation(text) {
        // Check for patterns that suggest display equations
        const displayPatterns = [
            /^[a-zA-Zαβγδεθλμπσφψω]\s*=\s*/, // Variable = expression
            /^[a-zA-Zαβγδεθλμπσφψω]\s*≤\s*/, // Variable ≤ expression
            /^[a-zA-Zαβγδεθλμπσφψω]\s*≥\s*/, // Variable ≥ expression
            /^√\([^)]+\)/, // Square roots
            /^\d+\/\d+/, // Fractions
            /^∑|^∏|^∫/, // Summation, product, integral
        ];
        // If text is longer than 50 characters or contains display patterns, treat as display
        return text.length > 50 || displayPatterns.some(pattern => pattern.test(text));
    }
    /**
     * Convert mathematical text to LaTeX format
     */
    convertToLatex(text) {
        // Remove equation numbers and clean up
        let latex = text.replace(/\(\d+\)$/, '').trim();
        // Common mathematical symbol conversions
        const symbolMap = {
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
            '∪': '\\cup',
            '∩': '\\cap',
            '∅': '\\emptyset',
            'ℕ': '\\mathbb{N}',
            'ℤ': '\\mathbb{Z}',
            'ℚ': '\\mathbb{Q}',
            'ℝ': '\\mathbb{R}',
            'ℂ': '\\mathbb{C}'
        };
        // Apply symbol conversions
        for (const [symbol, latexSymbol] of Object.entries(symbolMap)) {
            latex = latex.replace(new RegExp(symbol, 'g'), latexSymbol);
        }
        // Handle fractions (a/b format)
        latex = latex.replace(/(\d+)\/(\d+)/g, '\\frac{$1}{$2}');
        // Handle subscripts and superscripts
        latex = latex.replace(/(\w+)_(\w+)/g, '$1_{$2}');
        latex = latex.replace(/(\w+)\^(\w+)/g, '$1^{$2}');
        // Handle square roots
        latex = latex.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
        latex = latex.replace(/√(\w+)/g, '\\sqrt{$1}');
        // Handle common functions
        const functions = ['sin', 'cos', 'tan', 'log', 'ln', 'exp', 'lim'];
        for (const func of functions) {
            const regex = new RegExp(`\\b${func}\\s*\\(([^)]+)\\)`, 'g');
            latex = latex.replace(regex, `\\${func}($1)`);
        }
        return latex;
    }
}
exports.DocumentProcessor = DocumentProcessor;
//# sourceMappingURL=DocumentProcessor.js.map