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
const ImageSeoService_1 = require("./ImageSeoService");
const PdfProcessor_1 = require("./PdfProcessor");
const equationPlacement_1 = require("../lib/equationPlacement");
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
                ],
                convertImage: mammoth_1.default.images.imgElement((image) => {
                    return image.read('base64').then((imageBuffer) => ({
                        src: `data:${image.contentType};base64,${imageBuffer}`,
                        alt: image.altText || '',
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
    async processHtmlContent(html, rawEquationZones) {
        // 0. Splice equations back into their original position BEFORE anything
        //    else touches the HTML. Anchors are matched against mammoth's raw,
        //    unmodified output — later steps (footnotes, cheerio's own
        //    re-serialization) can shift whitespace/tag boundaries slightly and
        //    would make the match less reliable.
        const { html: htmlWithEquations, equations } = this.placeEquations(rawEquationZones, html);
        const $ = cheerio.load(htmlWithEquations);
        // 1. Extract & remove title from body
        const title = this.extractTitle($);
        // 2. Process footnotes (rewrite Word's _ftn anchors)
        const footnotes = this.extractFootnotes($);
        // 3. Extract image metadata (nearby heading/caption, then optional AI)
        const images = await this.extractImages($, title);
        // 4. Link in-text citations → ΒΙΒΛΙΟΓΡΑΦΙΑ entries
        const citations = this.linkCitations($);
        // 5. Wrap orphaned <li> elements in <ul>
        this.processLists($);
        // 6. Strip all unnecessary markup (classes, ids, scripts, styles, empties)
        this.cleanHtml($);
        // 7. Compute excerpt and word count
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
    extractFootnotes($) {
        const footnotes = [];
        // Maps Word's own per-type key (e.g. "footnote-1", "endnote-1", "ftn3")
        // to the sequential id this repo assigns across all note types.
        const sequentialIdByOriginalKey = new Map();
        let nextSequentialId = 1;
        let legacyFallbackCounter = 1;
        // ── Rewrite in-text reference markers (footnotes AND endnotes) ──
        // mammoth footnote: <sup><a href="#doc-footnote-N" id="doc-footnote-ref-N">[N]</a></sup>
        // mammoth endnote:  <sup><a href="#doc-endnote-N"  id="doc-endnote-ref-N">[N]</a></sup>
        // Legacy Word:      <a href="#_ftnN">
        // Replaced with the literal token `[^N]` — Astro renders this into a
        // styled superscript link at build time; no markup needs to survive
        // this repo's own cleanHtml() class-stripping pass.
        $('a[href^="#doc-footnote-"], a[href^="#doc-endnote-"], a[href^="#_ftn"]').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href') || '';
            let originalKey;
            if (href.startsWith('#doc-footnote-')) {
                originalKey = `footnote-${href.replace('#doc-footnote-', '')}`;
            }
            else if (href.startsWith('#doc-endnote-')) {
                originalKey = `endnote-${href.replace('#doc-endnote-', '')}`;
            }
            else {
                const legacyId = href.replace('#_ftn', '') || legacyFallbackCounter.toString();
                originalKey = `ftn-${legacyId}`;
                legacyFallbackCounter++;
            }
            const sequentialId = nextSequentialId.toString();
            sequentialIdByOriginalKey.set(originalKey, sequentialId);
            nextSequentialId++;
            const $sup = $el.closest('sup');
            const $target = $sup.length ? $sup : $el;
            $target.replaceWith(`[^${sequentialId}]`);
        });
        // ── Collect note body text (footnotes AND endnotes) ──
        // mammoth footnote: <ol><li id="doc-footnote-N"><p>text</p></li></ol>
        // mammoth endnote:  <ol><li id="doc-endnote-N"><p>text</p></li></ol>
        // Legacy Word:       <div id="_ftnN">...</div>
        $('li[id^="doc-footnote-"], li[id^="doc-endnote-"], div[id^="_ftn"]').each((idx, el) => {
            const $el = $(el);
            const text = $el.text().trim();
            if (!text)
                return;
            const elId = $el.attr('id') || '';
            let originalKey;
            if (elId.startsWith('doc-footnote-')) {
                originalKey = `footnote-${elId.replace('doc-footnote-', '')}`;
            }
            else if (elId.startsWith('doc-endnote-')) {
                originalKey = `endnote-${elId.replace('doc-endnote-', '')}`;
            }
            else {
                originalKey = `ftn-${elId.replace('_ftn', '')}`;
            }
            // Fall back to a fresh sequential id if no matching in-text reference
            // was found (shouldn't normally happen — Word always pairs the two).
            const id = sequentialIdByOriginalKey.get(originalKey) ?? (nextSequentialId++).toString();
            footnotes.push({
                id: `fn-${id}`,
                text,
                backRef: `fnref-${id}`,
            });
            // Replace with a plain <li id="fn-N"> so it stays a valid child of
            // the surrounding <ol> mammoth already produced (the previous <div>
            // replacement broke out of that list).
            $el.replaceWith(`<li id="fn-${id}">${text} <a href="#fnref-${id}">↩</a></li>`);
        });
        // Clean up any now-empty <ol> wrappers left behind by mammoth's footnote list
        $('ol').each((_, el) => {
            const $el = $(el);
            if ($el.children().length === 0 && $el.text().trim() === '') {
                $el.remove();
            }
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
     * Extract ALL author surnames from a bibliography entry text.
     * Looks for capitalized words before commas in the author portion
     * (everything before the year).  This lets us index entries by
     * non-first authors too, so "(Lemonde, 1998)" can match an entry
     * that starts with "Laurent, Ph., Lemonde, P., …, 1998."
     */
    extractAllSurnames(text, year) {
        const yearIdx = text.indexOf(year);
        if (yearIdx < 0)
            return [];
        const authorPart = text.substring(0, yearIdx);
        // Find words of 2+ letters that appear before a comma — these are
        // likely surnames in "Surname, Initial." patterns.
        const surnameRe = /([\p{L}][\p{L}\-']+)\s*,/gu;
        const surnames = [];
        let m;
        while ((m = surnameRe.exec(authorPart)) !== null) {
            if (m[1].length > 1) {
                surnames.push(this.normalizeName(m[1]));
            }
        }
        return [...new Set(surnames)];
    }
    /**
     * Walk every text-containing element *before* the bibliography heading
     * and replace "(Author, Year)" patterns with `<a href="#bib-...">` links.
     */
    linkInTextCitations($, entries, bibHeading) {
        // Build a lookup map:  "normalizedSurname-year" → BibliographyEntry
        // Primary key: first author's surname.
        // Secondary keys: every other author surname in the same entry,
        // so that e.g. "(Lemonde, 1998)" can find the Laurent et al. 1998 entry.
        const lookup = new Map();
        for (const e of entries) {
            // Primary key
            lookup.set(`${e.surname}-${e.year}`, e);
            // Secondary keys from all author surnames in the full text
            const allSurnames = this.extractAllSurnames(e.text, e.year);
            for (const s of allSurnames) {
                if (!lookup.has(`${s}-${e.year}`)) {
                    lookup.set(`${s}-${e.year}`, e);
                }
            }
        }
        // Broad citation regex.
        //
        // Matches any "(SOMETHING, YEAR)" where SOMETHING starts with a
        // Unicode letter.  This covers all common academic citation formats:
        //
        //   (Author, 1989)                simple
        //   (Author & Author, 1989)       multi-author
        //   (Author et al., 1989)         et al.
        //   (De Marchi, 1982)             multi-word surname
        //   (F. Maier et al., 2025)       initial before surname
        //   (Παπαδόπουλος, 2023)          Greek names
        //   (Author, 2011, σ.438)         with page reference
        //   (Author, 2020: 55-60)         colon-style page
        //
        // Group 1 = author portion (everything before the last ", YEAR")
        // Group 2 = year
        // Group 3 = optional trailing content (page refs, etc.)
        const citationRe = /\(([\p{L}][^()]*?),\s*((?:19|20)\d{2}[a-z]?)(\s*[,:][^)]*)?\)/gu;
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
            citationRe.lastIndex = 0;
            const replaced = html.replace(citationRe, (full, authors, yearStr, extra) => {
                const baseYear = yearStr.replace(/[a-z]$/, '');
                // Extract candidate surnames from the author text.
                // Strip "et al.", "κ.α.", ampersands, "και", then split into words.
                // Filter out single-letter initials (like "F.") and try each
                // remaining word as a potential surname for lookup.
                const cleaned = authors
                    .replace(/\s*et\s+al\.?\s*/gi, ' ')
                    .replace(/\s*κ\.?\s*α\.?\s*/gi, ' ')
                    .replace(/&amp;/g, ' ')
                    .replace(/&/g, ' ')
                    .replace(/και/g, ' ')
                    .replace(/,/g, ' ');
                const candidates = cleaned
                    .split(/\s+/)
                    .filter((w) => w.length > 1)
                    .filter((w) => !/^[\p{L}]\.$/u.test(w)); // skip initials like "F."
                for (const word of candidates) {
                    const key = `${this.normalizeName(word)}-${baseYear}`;
                    const entry = lookup.get(key);
                    if (entry) {
                        const trailing = extra || '';
                        return `<a href="#${entry.id}">(${authors}, ${yearStr}${trailing})</a>`;
                    }
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
     * Extract OMath zones by unzipping the .docx with JSZip and reading
     * word/document.xml. This replaces the broken approach of reading the
     * compressed buffer as UTF-8.
     *
     * Returns one zone per equation, each carrying the surrounding paragraph
     * text needed to relocate it in the mammoth-converted HTML later (see
     * src/lib/equationPlacement.ts) — mammoth silently drops OOXML math from
     * its own HTML output, so there is no other trace of where it belongs.
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
            const zones = (0, equationPlacement_1.extractRawEquationZones)(xml);
            console.log(`Found ${zones.length} equations in document XML`);
            return zones;
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
    placeEquations(zones, html) {
        const positioned = zones.map((zone) => ({
            latex: this.convertToLatex(this.extractMathText(zone.omathXml)),
            display: zone.display,
            before: zone.before,
            after: zone.after,
            precedingParagraphTail: zone.precedingParagraphTail,
        }));
        const { html: placedHtml, placedInline, appendedAtEnd } = (0, equationPlacement_1.placeEquationsInHtml)(html, positioned);
        console.log(`Placed ${placedInline} equation(s) near their original text; ${appendedAtEnd} appended at the end (no confident anchor found).`);
        const equations = positioned.map((eq, index) => ({
            id: `equation-${index + 1}`,
            latex: eq.latex,
            display: eq.display,
        }));
        return { html: placedHtml, equations };
    }
    // ─── Images ───────────────────────────────────────────────────────
    /**
     * Extract base64-embedded images and derive SEO filename / alt / title
     * from nearby document text. Internal ids stay `image-N`.
     */
    async extractImages($, articleTitle) {
        const images = [];
        const usedStems = new Set();
        const imgEls = $('img').toArray();
        for (let idx = 0; idx < imgEls.length; idx++) {
            const $el = $(imgEls[idx]);
            const src = $el.attr('src');
            if (!src || !src.startsWith('data:'))
                continue;
            const matches = src.match(/data:([^;]+);base64,(.+)/);
            if (!matches)
                continue;
            const rawAlt = ($el.attr('alt') || '').trim();
            const wordAlt = (0, ImageSeoService_1.isGenericAlt)(rawAlt) ? '' : rawAlt;
            const caption = this.findFollowingCaption($el);
            const heading = this.findNearestHeading($, $el);
            const id = `image-${idx + 1}`;
            const seo = (0, ImageSeoService_1.seoFromContext)({ wordAlt, caption, heading, articleTitle }, id);
            const filename = (0, ImageSeoService_1.uniquifyFilenameStem)(seo.filename, usedStems);
            if (seo.alt)
                $el.attr('alt', seo.alt);
            images.push({
                id,
                filename,
                alt: seo.alt,
                title: seo.title || ($el.attr('title') || ''),
                caption: seo.caption,
                seoSource: seo.seoSource,
                data: Buffer.from(matches[2], 'base64'),
                contentType: matches[1],
            });
        }
        await ImageSeoService_1.imageSeoService.enrichWeakImages(images, articleTitle);
        for (const img of images) {
            const $match = this.findImgByDataUri($, img);
            if ($match && img.alt)
                $match.attr('alt', img.alt);
        }
        return images;
    }
    findImgByDataUri($, img) {
        const dataUri = `data:${img.contentType};base64,${img.data.toString('base64')}`;
        const $found = $('img').filter((_, el) => $(el).attr('src') === dataUri);
        return $found.length ? $found.first() : null;
    }
    findNearestHeading($, $el) {
        let $node = $el;
        while ($node.length) {
            let $prev = $node.prev();
            while ($prev.length) {
                if ($prev.is('h1, h2, h3, h4, h5, h6')) {
                    return $prev.text().trim();
                }
                const $nested = $prev.find('h1, h2, h3, h4, h5, h6').last();
                if ($nested.length)
                    return $nested.text().trim();
                $prev = $prev.prev();
            }
            $node = $node.parent();
            if (!$node.length || $node.is('body') || $node.is('html'))
                break;
        }
        return '';
    }
    findFollowingCaption($el) {
        const candidates = [];
        const $next = $el.next();
        if ($next.length)
            candidates.push($next);
        const $parent = $el.parent();
        if ($parent.length && !$parent.is('body') && !$parent.is('html')) {
            const $parentNext = $parent.next();
            if ($parentNext.length)
                candidates.push($parentNext);
        }
        for (const $cand of candidates) {
            const text = $cand.text().trim();
            const italicOnly = $cand.is('em, i') ||
                ($cand.find('em, i').length > 0 &&
                    $cand.find('em, i').text().trim() === text);
            if ((0, ImageSeoService_1.looksLikeCaption)(text, { italic: italicOnly }))
                return text;
        }
        return '';
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
        // Strip id attributes except those used for citation or footnote anchoring.
        // `fn-N` is the footnote-body id the InScience-v2 Astro frontend expects
        // (paired with the literal `[^N]` token extractFootnotes leaves in-text).
        $('[id]').each((_, el) => {
            const $el = $(el);
            const id = $el.attr('id') || '';
            if (!id.startsWith('bib-') && !id.startsWith('fn-')) {
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