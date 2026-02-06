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
const jszip_1 = __importDefault(require("jszip"));
const PdfProcessor_1 = require("./PdfProcessor");
// ═══════════════════════════════════════════════════════════════════════
//  DocumentProcessor — converts .docx / .pdf → clean, minimal HTML
//  suitable for WordPress + WPBakery (Visual Bakery).
//
//  Design goals:
//    • No extra classes, scripts, or inline styles in the output.
//    • Preserve hyperlinks (<a>), subscripts (<sub>), superscripts (<sup>).
//    • Link in-text citations like (Author, 1989) to the matching entry
//      in the ΒΙΒΛΙΟΓΡΑΦΙΑ section via anchor tags.
//    • Keep LaTeX formulas as $$...$$ / $...$ delimiters so a MathJax or
//      KaTeX WordPress plugin can render them.
// ═══════════════════════════════════════════════════════════════════════
class DocumentProcessor {
    constructor() {
        this.pdfProcessor = new PdfProcessor_1.PdfProcessor();
    }
    /**
     * Main entry point: accept a document buffer (Word or PDF) and return
     * structured content ready for WordPress publishing.
     */
    async processDocument(buffer, filename) {
        try {
            const documentType = this.detectDocumentType(buffer, filename);
            console.log(`Detected document type: ${documentType}`);
            if (documentType === 'pdf') {
                const result = await this.pdfProcessor.processPdf(buffer);
                return { ...result, documentType: 'pdf' };
            }
            else {
                const result = await this.processWordDocument(buffer);
                return { ...result, documentType: 'word' };
            }
        }
        catch (error) {
            console.error('Error processing document:', error);
            throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // ─── Document Type Detection ──────────────────────────────────────
    detectDocumentType(buffer, filename) {
        // Check filename extension first
        if (filename) {
            const ext = filename.toLowerCase().split('.').pop();
            if (ext === 'pdf')
                return 'pdf';
            if (ext === 'docx' || ext === 'doc')
                return 'word';
        }
        // Fall back to magic bytes
        const header = buffer.toString('hex', 0, 8).toLowerCase();
        if (buffer.toString('ascii', 0, 4) === '%PDF')
            return 'pdf';
        if (header.startsWith('504b0304') || header.startsWith('504b0506') || header.startsWith('504b0708'))
            return 'word';
        if (header.startsWith('d0cf11e0a1b11ae1'))
            return 'word';
        console.warn('Could not determine document type, defaulting to Word');
        return 'word';
    }
    // ─── Word Document Processing ─────────────────────────────────────
    /**
     * Convert a .docx buffer to clean HTML.
     * Uses a minimal mammoth styleMap — no equation or WordPress-specific
     * class mappings.
     */
    async processWordDocument(buffer) {
        try {
            const options = {
                styleMap: [
                    // Headings
                    "p[style-name='Heading 1'] => h1:fresh",
                    "p[style-name='Heading 2'] => h2:fresh",
                    "p[style-name='Heading 3'] => h3:fresh",
                    "p[style-name='Heading 4'] => h4:fresh",
                    "p[style-name='Heading 5'] => h5:fresh",
                    "p[style-name='Heading 6'] => h6:fresh",
                    // Basic text formatting (mammoth handles sub/sup natively)
                    "b => strong",
                    "i => em",
                    "u => u",
                    // Lists
                    "p[style-name='List Paragraph'] => li:fresh",
                    // Quotes
                    "p[style-name='Quote'] => blockquote > p:fresh",
                    // Footnote text — used for detection, class stripped later
                    "p[style-name='Footnote Text'] => p.footnote-text:fresh",
                ],
                convertImage: mammoth_1.default.images.imgElement((image) => {
                    return image.read('base64').then((imageBuffer) => ({
                        src: `data:${image.contentType};base64,${imageBuffer}`,
                        alt: image.altText || 'Document image',
                    }));
                }),
                includeDefaultStyleMap: true,
                idPrefix: 'doc-',
            };
            // Extract equations from the actual .docx XML (via JSZip)
            const rawXmlEquations = await this.extractOMathFromXML(buffer);
            // Convert to HTML
            const result = await mammoth_1.default.convertToHtml({ buffer }, options);
            // Log non-OMath conversion messages
            if (result.messages.length > 0) {
                const filtered = result.messages.filter((msg) => !msg.message.includes('oMath') && !msg.message.includes('oMathPara'));
                if (filtered.length > 0) {
                    console.log('Mammoth conversion messages:', filtered);
                }
            }
            return await this.processHtmlContent(result.value, rawXmlEquations);
        }
        catch (error) {
            console.error('Error processing Word document:', error);
            throw new Error(`Failed to process Word document: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // ─── HTML Post-Processing Pipeline ────────────────────────────────
    /**
     * Master pipeline: extract metadata, link citations, clean markup.
     * Order matters — citation linking adds ids that must survive the
     * subsequent cleanHtml pass.
     */
    async processHtmlContent(html, rawXmlEquations) {
        const $ = cheerio.load(html);
        // 1. Extract & remove title from body
        const title = this.extractTitle($);
        // 2. Process footnotes (rewrite Word's _ftn anchors)
        const footnotes = this.extractFootnotes($);
        // 3. Handle equations — insert $$...$$ for any OMath content
        const equations = this.extractEquations($, rawXmlEquations);
        // 4. Extract image metadata
        const images = this.extractImages($);
        // 5. Link in-text citations → ΒΙΒΛΙΟΓΡΑΦΙΑ entries
        const citations = this.linkCitations($);
        // 6. Wrap orphaned <li> elements in <ul>
        this.processLists($);
        // 7. Strip all unnecessary markup (classes, ids, scripts, styles, empties)
        this.cleanHtml($);
        // 8. Compute excerpt and word count
        const excerpt = this.generateExcerpt($);
        const wordCount = this.countWords($);
        // Return only the body inner-HTML (no <html>/<head>/<body> wrappers)
        const content = $('body').html() || '';
        return {
            title,
            content,
            excerpt,
            footnotes,
            citations,
            images,
            equations,
            wordCount,
        };
    }
    // ─── Title ────────────────────────────────────────────────────────
    extractTitle($) {
        let title = $('h1').first().text().trim();
        if (!title) {
            // Use first short paragraph that looks like a title
            const firstP = $('p').first().text().trim();
            if (firstP && firstP.length < 100 && !firstP.includes('.')) {
                title = firstP;
                $('p').first().remove();
            }
        }
        return title || 'Untitled Document';
    }
    // ─── Footnotes ────────────────────────────────────────────────────
    /**
     * Rewrite Word's footnote anchors (#_ftn*) into a clean scheme
     * (footnote-N / footnote-ref-N) and collect footnote text.
     */
    extractFootnotes($) {
        const footnotes = [];
        let counter = 1;
        // Rewrite in-text footnote reference links
        $('a[href^="#_ftn"]').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href');
            const id = href?.replace('#_ftn', '') || counter.toString();
            $el.attr('href', `#footnote-${id}`);
            $el.attr('id', `footnote-ref-${id}`);
            counter++;
        });
        // Collect footnote text and rewrite as clean anchored elements
        $('div[id^="_ftn"], p.footnote-text').each((idx, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            if (!text)
                return;
            const id = $el.attr('id')?.replace('_ftn', '') || (idx + 1).toString();
            footnotes.push({
                id: `footnote-${id}`,
                text,
                backRef: `footnote-ref-${id}`,
            });
            // Replace with a clean footnote div (id preserved by cleanHtml)
            $el.replaceWith(`<div id="footnote-${id}"><p>${text} <a href="#footnote-ref-${id}">↩</a></p></div>`);
        });
        return footnotes;
    }
    // ─── Citation Linking System ──────────────────────────────────────
    /**
     * Detect the ΒΙΒΛΙΟΓΡΑΦΙΑ (bibliography) section, parse its entries,
     * and turn every in-text "(Author, Year)" occurrence into an anchor
     * link pointing to the matching bibliography entry.
     *
     * Returns the Citation[] metadata array.
     */
    linkCitations($) {
        const citations = [];
        // ── Step A: find the bibliography heading ──
        let bibHeading = null;
        $('h1, h2, h3, h4, h5, h6, p').each((_, el) => {
            if (bibHeading)
                return; // already found
            const $el = $(el);
            const text = $el.text().trim();
            // Match "ΒΙΒΛΙΟΓΡΑΦΙΑ" in any case (with or without accent on Ι),
            // plus the common English equivalents.
            if (/^(?:βιβλιογραφ[ιί]α|bibliography|references)\s*:?\s*$/iu.test(text)) {
                bibHeading = $el;
            }
        });
        if (!bibHeading) {
            console.log('No bibliography section (ΒΙΒΛΙΟΓΡΑΦΙΑ) found');
            return citations;
        }
        console.log('Found bibliography section');
        // ── Step B: collect & parse bibliography entries ──
        const entries = [];
        let current = bibHeading.next();
        while (current.length > 0) {
            const tag = (current.prop('tagName') || '').toLowerCase();
            // Stop at the next major heading (h1–h3)
            if (/^h[1-3]$/.test(tag))
                break;
            const text = current.text().trim();
            if (text && text.length > 10) {
                const entry = this.parseBibEntry(text);
                if (entry) {
                    entries.push(entry);
                    // Stamp the element with an anchor id
                    current.attr('id', entry.id);
                    citations.push({
                        id: entry.id,
                        text: entry.text,
                        source: `${entry.surname}, ${entry.year}`,
                    });
                }
            }
            current = current.next();
        }
        console.log(`Parsed ${entries.length} bibliography entries`);
        // ── Steps C & D: scan body for in-text citations and link them ──
        if (entries.length > 0) {
            this.linkInTextCitations($, entries, bibHeading);
        }
        return citations;
    }
    /**
     * Parse a single bibliography line to extract the leading surname
     * and the year.
     *
     * Handles formats like:
     *   "Παπαδόπουλος, Α. (2023). Τίτλος..."
     *   "Smith, J. (1989). Title..."
     *   "Writer (1989) Title..."
     */
    parseBibEntry(text) {
        // Look for a four-digit year (19xx or 20xx), optionally in parentheses
        const yearMatch = text.match(/\(?((?:19|20)\d{2})[a-z]?\)?/);
        if (!yearMatch)
            return null;
        const year = yearMatch[1];
        // Leading surname: sequence of Unicode letters, hyphens, or apostrophes
        const surnameMatch = text.match(/^([\p{L}\-']+)/u);
        if (!surnameMatch)
            return null;
        const surname = surnameMatch[1];
        const normalized = this.normalizeName(surname);
        const id = `bib-${normalized}-${year}`;
        return { id, surname: normalized, year, text };
    }
    /**
     * Normalize a name for anchor-id generation and matching:
     * lowercase → strip combining diacritics → keep only letters & digits.
     */
    normalizeName(name) {
        return name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove combining diacritical marks
            .replace(/[^\p{L}\p{N}]/gu, ''); // keep letters and digits only
    }
    /**
     * Walk every text-containing element *before* the bibliography heading
     * and replace "(Author, Year)" patterns with `<a href="#bib-...">` links.
     */
    linkInTextCitations($, entries, bibHeading) {
        // Build a lookup map:  "normalizedSurname-year" → BibliographyEntry
        const lookup = new Map();
        for (const e of entries) {
            lookup.set(`${e.surname}-${e.year}`, e);
        }
        // Regex that matches in-text citations.
        //
        //   (Author, 1989)
        //   (Author & Author, 1989)
        //   (Author et al., 1989)
        //   (Παπαδόπουλος, 2023)
        //   (Author κ.α., 2023)
        //
        // The first capture group is the author portion, the second is the year.
        const citationRe = /\(([\p{L}\-']+(?:\s*(?:&amp;|&|και)\s*[\p{L}\-']+)*(?:\s*(?:et\s+al\.?|κ\.?\s*α\.?))?)\s*,\s*((?:19|20)\d{2}[a-z]?)\)/gu;
        const bibHeadingEl = bibHeading[0];
        let reachedBib = false;
        $('p, li, td, th, h1, h2, h3, h4, h5, h6').each((_, el) => {
            if (reachedBib)
                return;
            if (el === bibHeadingEl) {
                reachedBib = true;
                return;
            }
            const $el = $(el);
            const html = $el.html();
            if (!html)
                return;
            // Reset the regex lastIndex for each element (since it has the g flag)
            citationRe.lastIndex = 0;
            const replaced = html.replace(citationRe, (full, authors, yearStr) => {
                // Extract the first surname from the captured author text
                const firstSurname = (authors.match(/^([\p{L}\-']+)/u) || [])[1];
                if (!firstSurname)
                    return full;
                // Strip optional year-letter suffix (e.g. 1989a → 1989) for lookup
                const baseYear = yearStr.replace(/[a-z]$/, '');
                const key = `${this.normalizeName(firstSurname)}-${baseYear}`;
                const entry = lookup.get(key);
                if (entry) {
                    return `<a href="#${entry.id}">(${authors}, ${yearStr})</a>`;
                }
                // No matching bibliography entry — leave the text as-is
                return full;
            });
            if (replaced !== html) {
                $el.html(replaced);
            }
        });
    }
    // ─── Equations ────────────────────────────────────────────────────
    /**
     * Extract OMath elements by unzipping the .docx with JSZip and
     * reading word/document.xml.  This replaces the broken approach of
     * reading the compressed buffer as UTF-8.
     */
    async extractOMathFromXML(buffer) {
        try {
            const zip = await jszip_1.default.loadAsync(buffer);
            const docFile = zip.file('word/document.xml');
            if (!docFile) {
                console.log('No word/document.xml found in .docx archive');
                return [];
            }
            const xml = await docFile.async('string');
            const equations = [];
            // Flexible namespace prefix: <m:oMath>, <w14:oMath>, etc.
            const omathRe = /<[^:]*:oMath\b[^>]*>([\s\S]*?)<\/[^:]*:oMath>/g;
            const omathParaRe = /<[^:]*:oMathPara\b[^>]*>([\s\S]*?)<\/[^:]*:oMathPara>/g;
            let m;
            while ((m = omathRe.exec(xml)) !== null) {
                const text = this.extractMathText(m[1]);
                if (text)
                    equations.push(text);
            }
            while ((m = omathParaRe.exec(xml)) !== null) {
                const text = this.extractMathText(m[1]);
                if (text)
                    equations.push(text);
            }
            console.log(`Found ${equations.length} equations in document XML`);
            return equations;
        }
        catch (error) {
            console.error('Error extracting OMath from XML:', error);
            return [];
        }
    }
    /** Strip XML tags from an OMath fragment and reconstruct the expression. */
    extractMathText(omathXml) {
        let text = omathXml.replace(/<[^>]*>/g, ' ');
        text = text.replace(/\s+/g, ' ').trim();
        text = this.reconstructMathExpression(text);
        return text;
    }
    /** Basic heuristic to tidy up math text extracted from OMath XML. */
    reconstructMathExpression(text) {
        text = text.replace(/(\w+)\s+(\^|\u005E)\s*(\w+)/g, '$1^$3'); // superscripts
        text = text.replace(/(\w+)\s+(_|\u005F)\s*(\w+)/g, '$1_$3'); // subscripts
        text = text.replace(/\s*\/\s*/g, '/'); // fractions
        text = text.replace(/\s*\+\s*/g, ' + '); // addition
        text = text.replace(/\s*-\s*/g, ' - '); // subtraction
        text = text.replace(/\s*\*\s*/g, ' \\times '); // multiplication
        text = text.replace(/\s*=\s*/g, ' = '); // equals
        return text;
    }
    /**
     * Process equations extracted from the .docx XML and record them
     * as metadata.  Each equation is also appended to the HTML body as
     * a paragraph with $$...$$ delimiters so a MathJax/KaTeX WordPress
     * plugin can render it.
     *
     * Any LaTeX already present in the body as $...$ / $$...$$ text
     * is left untouched — it will render naturally via the WP plugin.
     */
    extractEquations($, rawXmlEquations = []) {
        const equations = [];
        let counter = 1;
        for (const raw of rawXmlEquations) {
            const id = `equation-${counter}`;
            const latex = this.convertToLatex(raw);
            equations.push({ id, latex, display: true });
            // Append as a clean paragraph with LaTeX display-math delimiters
            $('body').append(`<p>$$${latex}$$</p>`);
            counter++;
        }
        console.log(`Extracted ${equations.length} equations from document XML`);
        return equations;
    }
    // ─── Images ───────────────────────────────────────────────────────
    /**
     * Extract base64-embedded images as metadata (for potential upload
     * to the WordPress media library later).
     */
    extractImages($) {
        const images = [];
        $('img').each((idx, el) => {
            const $el = $(el);
            const src = $el.attr('src');
            if (!src || !src.startsWith('data:'))
                return;
            const matches = src.match(/data:([^;]+);base64,(.+)/);
            if (!matches)
                return;
            images.push({
                id: `image-${idx + 1}`,
                alt: $el.attr('alt') || '',
                title: $el.attr('title') || '',
                data: Buffer.from(matches[2], 'base64'),
                contentType: matches[1],
            });
        });
        return images;
    }
    // ─── Clean HTML ───────────────────────────────────────────────────
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
    cleanHtml($) {
        // Remove <script> and <style> tags entirely
        $('script, style').remove();
        // Strip all class attributes
        $('[class]').removeAttr('class');
        // Strip id attributes except those used for citation or footnote anchoring
        $('[id]').each((_, el) => {
            const $el = $(el);
            const id = $el.attr('id') || '';
            if (!id.startsWith('bib-') && !id.startsWith('footnote-')) {
                $el.removeAttr('id');
            }
        });
        // Remove empty paragraphs (preserve those containing images, sub/sup, or br)
        $('p').each((_, el) => {
            const $el = $(el);
            if ($el.text().trim() === '' &&
                $el.find('img, sub, sup, br').length === 0) {
                $el.remove();
            }
        });
        // Remove data-* attributes from all elements
        $('*').each((_, el) => {
            const attribs = el.attribs || {};
            for (const attr of Object.keys(attribs)) {
                if (attr.startsWith('data-')) {
                    $(el).removeAttr(attr);
                }
            }
        });
    }
    // ─── Lists ────────────────────────────────────────────────────────
    /**
     * Group consecutive orphaned <li> elements into proper <ul> wrappers.
     * mammoth may output bare <li> elements without a parent list.
     */
    processLists($) {
        const listItems = $('li');
        let currentList = null;
        listItems.each((_, el) => {
            const $li = $(el);
            if (!currentList) {
                currentList = $('<ul>');
                $li.before(currentList);
            }
            currentList.append($li);
            if (!$li.next().is('li')) {
                currentList = null;
            }
        });
    }
    // ─── Excerpt & Word Count ─────────────────────────────────────────
    generateExcerpt($) {
        const text = $('body').text().trim();
        const words = text.split(/\s+/).slice(0, 55);
        return words.join(' ') + (words.length >= 55 ? '...' : '');
    }
    countWords($) {
        const text = $('body').text().trim();
        return text.split(/\s+/).filter((w) => w.length > 0).length;
    }
    // ─── LaTeX Conversion ─────────────────────────────────────────────
    /**
     * Convert extracted mathematical text (from OMath XML) into LaTeX
     * notation.  Handles Unicode symbols, fractions, sub/superscripts,
     * roots, named functions, integrals, limits, and matrices.
     */
    convertToLatex(text) {
        // Remove trailing equation numbers and normalize whitespace
        let latex = text.replace(/\(\d+\)$/, '').trim();
        latex = latex.replace(/\s+/g, ' ');
        latex = latex.replace(/[\u00A0\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]/g, ' ');
        // Unicode → LaTeX symbol map
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
            // Greek lowercase
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
            // Greek uppercase (only those that differ from Latin)
            'Γ': '\\Gamma',
            'Δ': '\\Delta',
            'Θ': '\\Theta',
            'Λ': '\\Lambda',
            'Π': '\\Pi',
            'Σ': '\\Sigma',
            'Φ': '\\Phi',
            'Ψ': '\\Psi',
            'Ω': '\\Omega',
            // Arrows
            '→': '\\rightarrow',
            '←': '\\leftarrow',
            '↔': '\\leftrightarrow',
            '⇒': '\\Rightarrow',
            '⇐': '\\Leftarrow',
            '⇔': '\\Leftrightarrow',
            // Set theory
            '∈': '\\in',
            '∉': '\\notin',
            '⊂': '\\subset',
            '⊃': '\\supset',
            '⊆': '\\subseteq',
            '⊇': '\\supseteq',
            '∪': '\\cup',
            '∩': '\\cap',
            '∅': '\\emptyset',
            // Number sets
            'ℕ': '\\mathbb{N}',
            'ℤ': '\\mathbb{Z}',
            'ℚ': '\\mathbb{Q}',
            'ℝ': '\\mathbb{R}',
            'ℂ': '\\mathbb{C}',
            // Miscellaneous
            '°': '^{\\circ}',
            '∠': '\\angle',
            '⊥': '\\perp',
            '∥': '\\parallel',
            '∴': '\\therefore',
            '∵': '\\because',
        };
        // Apply symbol conversions using split/join (safe for special chars)
        for (const [sym, cmd] of Object.entries(symbolMap)) {
            latex = latex.split(sym).join(cmd);
        }
        // Fractions
        latex = latex.replace(/\(([^)]+)\)\/\(([^)]+)\)/g, '\\frac{$1}{$2}');
        latex = latex.replace(/(\w+(?:\^\w+|\^{\w+})?)\s*\/\s*(\w+(?:\^\w+|\^{\w+})?)/g, '\\frac{$1}{$2}');
        latex = latex.replace(/(\d+)\s*\/\s*(\d+)/g, '\\frac{$1}{$2}');
        // Subscripts / superscripts
        latex = latex.replace(/(\w+)_\{([^}]+)\}/g, '$1_{$2}');
        latex = latex.replace(/(\w+)_(\w+)/g, '$1_{$2}');
        latex = latex.replace(/(\w+)\^\{([^}]+)\}/g, '$1^{$2}');
        latex = latex.replace(/(\w+)\^(\w+)/g, '$1^{$2}');
        latex = latex.replace(/(\w+)\^(-?\d+)/g, '$1^{$2}');
        // Square roots
        latex = latex.replace(/\\sqrt\s*\(([^)]+)\)/g, '\\sqrt{$1}');
        latex = latex.replace(/\\sqrt\s*([a-zA-Z0-9]+)/g, '\\sqrt{$1}');
        latex = latex.replace(/(\d+)\\sqrt\{([^}]+)\}/g, '\\sqrt[$1]{$2}');
        // Named functions
        const fns = [
            'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
            'log', 'ln', 'exp', 'lim', 'max', 'min',
            'arcsin', 'arccos', 'arctan',
        ];
        for (const fn of fns) {
            latex = latex.replace(new RegExp(`\\b${fn}\\s*\\(([^)]+)\\)`, 'g'), `\\${fn}($1)`);
            latex = latex.replace(new RegExp(`\\b${fn}\\s+([a-zA-Z0-9\\\\{}^_]+)`, 'g'), `\\${fn} $1`);
        }
        // Summation / product
        latex = latex.replace(/\\sum\s*\(([^)]+)\s+to\s+([^)]+)\)/g, '\\sum_{$1}^{$2}');
        latex = latex.replace(/\\prod\s*\(([^)]+)\s+to\s+([^)]+)\)/g, '\\prod_{$1}^{$2}');
        // Integrals
        latex = latex.replace(/\\int\s*([^{]+)\s+d([a-zA-Z])/g, '\\int $1 \\, d$2');
        // Limits
        latex = latex.replace(/\\lim\s*([^{]+)→([^{]+)/g, '\\lim_{$1 \\to $2}');
        // Matrices (semicolons become row breaks)
        latex = latex.replace(/\[([^\]]+)\]/g, (match, content) => {
            if (content.includes(';') || content.includes('\\\\')) {
                return `\\begin{bmatrix} ${content.replace(/;/g, '\\\\')} \\end{bmatrix}`;
            }
            return match;
        });
        // Absolute values, floor, ceiling
        latex = latex.replace(/\|([^|]+)\|/g, '\\left|$1\\right|');
        latex = latex.replace(/⌊([^⌋]+)⌋/g, '\\lfloor $1 \\rfloor');
        latex = latex.replace(/⌈([^⌉]+)⌉/g, '\\lceil $1 \\rceil');
        // Final whitespace cleanup
        latex = latex.replace(/\s+/g, ' ').trim();
        return latex;
    }
}
exports.DocumentProcessor = DocumentProcessor;
//# sourceMappingURL=DocumentProcessor.js.map