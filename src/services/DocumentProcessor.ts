import mammoth from 'mammoth';
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import {
  imageSeoService,
  isGenericAlt,
  looksLikeCaption,
  seoFromContext,
  uniquifyFilenameStem,
  type ImageSeoSource,
} from './ImageSeoService';
import { PdfProcessor } from './PdfProcessor';

// ─── Public Interfaces ────────────────────────────────────────────────

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

// ─── Internal: parsed bibliography entry ──────────────────────────────

interface BibliographyEntry {
  /** Anchor id, e.g. "bib-writer-1989" */
  id: string;
  /** Normalized surname used as a matching key */
  surname: string;
  /** Four-digit year string */
  year: string;
  /** Full text of the bibliography line */
  text: string;
}

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

export class DocumentProcessor {
  private pdfProcessor: PdfProcessor;

  constructor() {
    this.pdfProcessor = new PdfProcessor();
  }

  /**
   * Main entry point: accept a document buffer (Word or PDF) and return
   * structured content ready for WordPress publishing.
   */
  async processDocument(buffer: Buffer, filename?: string): Promise<ProcessedContent> {
    try {
      const documentType = this.detectDocumentType(buffer, filename);
      console.log(`Detected document type: ${documentType}`);

      if (documentType === 'pdf') {
        const result = await this.pdfProcessor.processPdf(buffer);
        return { ...result, documentType: 'pdf' };
      } else {
        const result = await this.processWordDocument(buffer);
        return { ...result, documentType: 'word' };
      }
    } catch (error) {
      console.error('Error processing document:', error);
      throw new Error(
        `Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ─── Document Type Detection ──────────────────────────────────────

  private detectDocumentType(buffer: Buffer, filename?: string): 'word' | 'pdf' {
    // Check filename extension first
    if (filename) {
      const ext = filename.toLowerCase().split('.').pop();
      if (ext === 'pdf') return 'pdf';
      if (ext === 'docx' || ext === 'doc') return 'word';
    }

    // Fall back to magic bytes
    const header = buffer.toString('hex', 0, 8).toLowerCase();
    if (buffer.toString('ascii', 0, 4) === '%PDF') return 'pdf';
    if (header.startsWith('504b0304') || header.startsWith('504b0506') || header.startsWith('504b0708')) return 'word';
    if (header.startsWith('d0cf11e0a1b11ae1')) return 'word';

    console.warn('Could not determine document type, defaulting to Word');
    return 'word';
  }

  // ─── Word Document Processing ─────────────────────────────────────

  /**
   * Convert a .docx buffer to clean HTML.
   * Uses a minimal mammoth styleMap — no equation or WordPress-specific
   * class mappings.
   */
  private async processWordDocument(buffer: Buffer): Promise<ProcessedContent> {
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
        convertImage: mammoth.images.imgElement((image: any) => {
          return image.read('base64').then((imageBuffer: string) => ({
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
      const result = await mammoth.convertToHtml({ buffer }, options);

      // Log non-OMath conversion messages
      if (result.messages.length > 0) {
        const filtered = result.messages.filter(
          (msg) => !msg.message.includes('oMath') && !msg.message.includes('oMathPara')
        );
        if (filtered.length > 0) {
          console.log('Mammoth conversion messages:', filtered);
        }
      }

      return await this.processHtmlContent(result.value, rawXmlEquations);
    } catch (error) {
      console.error('Error processing Word document:', error);
      throw new Error(
        `Failed to process Word document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // ─── HTML Post-Processing Pipeline ────────────────────────────────

  /**
   * Master pipeline: extract metadata, link citations, clean markup.
   * Order matters — citation linking adds ids that must survive the
   * subsequent cleanHtml pass.
   */
  private async processHtmlContent(
    html: string,
    rawXmlEquations: string[]
  ): Promise<ProcessedContent> {
    const $ = cheerio.load(html);

    // 1. Extract & remove title from body
    const title = this.extractTitle($);

    // 2. Process footnotes (rewrite Word's _ftn anchors)
    const footnotes = this.extractFootnotes($);

    // 3. Handle equations — insert $$...$$ for any OMath content
    const equations = this.extractEquations($, rawXmlEquations);

    // 4. Extract image metadata (nearby heading/caption, then optional AI)
    const images = await this.extractImages($, title);

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

  private extractTitle($: cheerio.CheerioAPI): string {
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
   * Rewrite footnote anchors into a clean scheme (footnote-N / footnote-ref-N)
   * and collect footnote text.
   *
   * Supports two formats:
   *   • mammoth native (idPrefix 'doc-'):  #doc-footnote-N / doc-footnote-ref-N
   *   • Legacy Word HTML:                  #_ftnN
   *
   * NOTE: We intentionally do NOT use the Word paragraph style "Footnote Text"
   * for detection, because mammoth applies that style to any paragraph bearing
   * it — including quoted / italic passages that were (mis-)styled with it in
   * the original .docx.  Only structurally-linked footnotes are reliable.
   */
  private extractFootnotes($: cheerio.CheerioAPI): Footnote[] {
    const footnotes: Footnote[] = [];
    let counter = 1;

    // ── Rewrite in-text footnote reference links ──
    // mammoth:      <sup><a href="#doc-footnote-N" id="doc-footnote-ref-N">[N]</a></sup>
    // Legacy Word:  <a href="#_ftnN">
    $('a[href^="#doc-footnote-"], a[href^="#_ftn"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';

      let id: string;
      if (href.startsWith('#doc-footnote-')) {
        id = href.replace('#doc-footnote-', '');
      } else {
        id = href.replace('#_ftn', '') || counter.toString();
      }

      $el.attr('href', `#footnote-${id}`);
      $el.attr('id', `footnote-ref-${id}`);
      counter++;
    });

    // ── Collect footnote body text ──
    // mammoth:      <ol><li id="doc-footnote-N"><p>text</p></li></ol>
    // Legacy Word:  <div id="_ftnN">...</div>
    $('li[id^="doc-footnote-"], div[id^="_ftn"]').each((idx, el) => {
      const $el = $(el);
      const text = $el.text().trim();
      if (!text) return;

      const elId = $el.attr('id') || '';
      let id: string;
      if (elId.startsWith('doc-footnote-')) {
        id = elId.replace('doc-footnote-', '');
      } else {
        id = elId.replace('_ftn', '') || (idx + 1).toString();
      }

      footnotes.push({
        id: `footnote-${id}`,
        text,
        backRef: `footnote-ref-${id}`,
      });

      // Replace with a clean footnote div (id preserved by cleanHtml)
      $el.replaceWith(
        `<div id="footnote-${id}"><p>${text} <a href="#footnote-ref-${id}">↩</a></p></div>`
      );
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
  private linkCitations($: cheerio.CheerioAPI): Citation[] {
    const citations: Citation[] = [];

    // ── Step A: find the bibliography heading ──
    let bibHeading: cheerio.Cheerio<any> | null = null;

    $('h1, h2, h3, h4, h5, h6, p').each((_, el) => {
      if (bibHeading) return; // already found
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
    const entries: BibliographyEntry[] = [];
    let current = (bibHeading as cheerio.Cheerio<any>).next();

    while (current.length > 0) {
      const tag = (current.prop('tagName') || '').toLowerCase();
      // Stop at the next major heading (h1–h3)
      if (/^h[1-3]$/.test(tag)) break;

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
      this.linkInTextCitations($, entries, bibHeading as cheerio.Cheerio<any>);
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
  private parseBibEntry(text: string): BibliographyEntry | null {
    // Look for a four-digit year (19xx or 20xx), optionally in parentheses
    const yearMatch = text.match(/\(?((?:19|20)\d{2})[a-z]?\)?/);
    if (!yearMatch) return null;
    const year = yearMatch[1];

    // Leading surname: sequence of Unicode letters, hyphens, or apostrophes
    const surnameMatch = text.match(/^([\p{L}\-']+)/u);
    if (!surnameMatch) return null;
    const surname = surnameMatch[1];

    const normalized = this.normalizeName(surname);
    const id = `bib-${normalized}-${year}`;

    return { id, surname: normalized, year, text };
  }

  /**
   * Normalize a name for anchor-id generation and matching:
   * lowercase → strip combining diacritics → keep only letters & digits.
   */
  private normalizeName(name: string): string {
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
  private extractAllSurnames(text: string, year: string): string[] {
    const yearIdx = text.indexOf(year);
    if (yearIdx < 0) return [];

    const authorPart = text.substring(0, yearIdx);

    // Find words of 2+ letters that appear before a comma — these are
    // likely surnames in "Surname, Initial." patterns.
    const surnameRe = /([\p{L}][\p{L}\-']+)\s*,/gu;
    const surnames: string[] = [];
    let m: RegExpExecArray | null;
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
  private linkInTextCitations(
    $: cheerio.CheerioAPI,
    entries: BibliographyEntry[],
    bibHeading: cheerio.Cheerio<any>
  ): void {
    // Build a lookup map:  "normalizedSurname-year" → BibliographyEntry
    // Primary key: first author's surname.
    // Secondary keys: every other author surname in the same entry,
    // so that e.g. "(Lemonde, 1998)" can find the Laurent et al. 1998 entry.
    const lookup = new Map<string, BibliographyEntry>();
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
    const citationRe =
      /\(([\p{L}][^()]*?),\s*((?:19|20)\d{2}[a-z]?)(\s*[,:][^)]*)?\)/gu;

    const bibHeadingEl = bibHeading[0];
    let reachedBib = false;

    $('p, li, td, th, h1, h2, h3, h4, h5, h6').each((_, el) => {
      if (reachedBib) return;
      if (el === bibHeadingEl) {
        reachedBib = true;
        return;
      }

      const $el = $(el);
      const html = $el.html();
      if (!html) return;

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
          .filter((w: string) => w.length > 1)
          .filter((w: string) => !/^[\p{L}]\.$/u.test(w)); // skip initials like "F."

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
   * Extract OMath elements by unzipping the .docx with JSZip and
   * reading word/document.xml.  This replaces the broken approach of
   * reading the compressed buffer as UTF-8.
   */
  private async extractOMathFromXML(buffer: Buffer): Promise<string[]> {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const docFile = zip.file('word/document.xml');
      if (!docFile) {
        console.log('No word/document.xml found in .docx archive');
        return [];
      }

      const xml = await docFile.async('string');
      const equations: string[] = [];

      // Flexible namespace prefix: <m:oMath>, <w14:oMath>, etc.
      const omathRe = /<[^:]*:oMath\b[^>]*>([\s\S]*?)<\/[^:]*:oMath>/g;
      const omathParaRe = /<[^:]*:oMathPara\b[^>]*>([\s\S]*?)<\/[^:]*:oMathPara>/g;

      let m: RegExpExecArray | null;
      while ((m = omathRe.exec(xml)) !== null) {
        const text = this.extractMathText(m[1]);
        if (text) equations.push(text);
      }
      while ((m = omathParaRe.exec(xml)) !== null) {
        const text = this.extractMathText(m[1]);
        if (text) equations.push(text);
      }

      console.log(`Found ${equations.length} equations in document XML`);
      return equations;
    } catch (error) {
      console.error('Error extracting OMath from XML:', error);
      return [];
    }
  }

  /** Strip XML tags from an OMath fragment and reconstruct the expression. */
  private extractMathText(omathXml: string): string {
    let text = omathXml.replace(/<[^>]*>/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    text = this.reconstructMathExpression(text);
    return text;
  }

  /** Basic heuristic to tidy up math text extracted from OMath XML. */
  private reconstructMathExpression(text: string): string {
    text = text.replace(/(\w+)\s+(\^|\u005E)\s*(\w+)/g, '$1^$3');   // superscripts
    text = text.replace(/(\w+)\s+(_|\u005F)\s*(\w+)/g, '$1_$3');    // subscripts
    text = text.replace(/\s*\/\s*/g, '/');                            // fractions
    text = text.replace(/\s*\+\s*/g, ' + ');                         // addition
    text = text.replace(/\s*-\s*/g, ' - ');                           // subtraction
    text = text.replace(/\s*\*\s*/g, ' \\times ');                    // multiplication
    text = text.replace(/\s*=\s*/g, ' = ');                           // equals
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
  private extractEquations(
    $: cheerio.CheerioAPI,
    rawXmlEquations: string[] = []
  ): Equation[] {
    const equations: Equation[] = [];
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
   * Extract base64-embedded images and derive SEO filename / alt / title
   * from nearby document text. Internal ids stay `image-N`.
   */
  private async extractImages(
    $: cheerio.CheerioAPI,
    articleTitle: string
  ): Promise<ProcessedImage[]> {
    const images: ProcessedImage[] = [];
    const usedStems = new Set<string>();

    const imgEls = $('img').toArray();
    for (let idx = 0; idx < imgEls.length; idx++) {
      const $el = $(imgEls[idx]);
      const src = $el.attr('src');
      if (!src || !src.startsWith('data:')) continue;

      const matches = src.match(/data:([^;]+);base64,(.+)/);
      if (!matches) continue;

      const rawAlt = ($el.attr('alt') || '').trim();
      const wordAlt = isGenericAlt(rawAlt) ? '' : rawAlt;
      const caption = this.findFollowingCaption($el);
      const heading = this.findNearestHeading($, $el);
      const id = `image-${idx + 1}`;
      const seo = seoFromContext(
        { wordAlt, caption, heading, articleTitle },
        id
      );

      const filename = uniquifyFilenameStem(seo.filename, usedStems);
      if (seo.alt) $el.attr('alt', seo.alt);

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

    await imageSeoService.enrichWeakImages(images, articleTitle);

    for (const img of images) {
      const $match = this.findImgByDataUri($, img);
      if ($match && img.alt) $match.attr('alt', img.alt);
    }

    return images;
  }

  private findImgByDataUri(
    $: cheerio.CheerioAPI,
    img: ProcessedImage
  ): cheerio.Cheerio<any> | null {
    const dataUri = `data:${img.contentType};base64,${img.data.toString('base64')}`;
    const $found = $('img').filter((_, el) => $(el).attr('src') === dataUri);
    return $found.length ? $found.first() : null;
  }

  private findNearestHeading(
    $: cheerio.CheerioAPI,
    $el: cheerio.Cheerio<any>
  ): string {
    let $node = $el;
    while ($node.length) {
      let $prev = $node.prev();
      while ($prev.length) {
        if ($prev.is('h1, h2, h3, h4, h5, h6')) {
          return $prev.text().trim();
        }
        const $nested = $prev.find('h1, h2, h3, h4, h5, h6').last();
        if ($nested.length) return $nested.text().trim();
        $prev = $prev.prev();
      }
      $node = $node.parent();
      if (!$node.length || $node.is('body') || $node.is('html')) break;
    }
    return '';
  }

  private findFollowingCaption($el: cheerio.Cheerio<any>): string {
    const candidates: cheerio.Cheerio<any>[] = [];
    const $next = $el.next();
    if ($next.length) candidates.push($next);

    const $parent = $el.parent();
    if ($parent.length && !$parent.is('body') && !$parent.is('html')) {
      const $parentNext = $parent.next();
      if ($parentNext.length) candidates.push($parentNext);
    }

    for (const $cand of candidates) {
      const text = $cand.text().trim();
      const italicOnly =
        $cand.is('em, i') ||
        ($cand.find('em, i').length > 0 &&
          $cand.find('em, i').text().trim() === text);
      if (looksLikeCaption(text, { italic: italicOnly })) return text;
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
  private cleanHtml($: cheerio.CheerioAPI): void {
    // Remove <script> and <style> tags entirely
    $('script, style').remove();

    // Strip all class attributes
    $('[class]').removeAttr('class');

    // Strip id attributes except those used for citation or footnote anchoring
    $('[id]').each((_, el) => {
      const $el = $(el);
      const id = $el.attr('id') || '';
      if (
        !id.startsWith('bib-') &&
        !id.startsWith('footnote-') &&
        !id.startsWith('doc-footnote-')
      ) {
        $el.removeAttr('id');
      }
    });

    // Remove empty paragraphs (preserve those containing images, sub/sup, or br)
    $('p').each((_, el) => {
      const $el = $(el);
      if (
        $el.text().trim() === '' &&
        $el.find('img, sub, sup, br').length === 0
      ) {
        $el.remove();
      }
    });

    // Remove data-* attributes from all elements
    $('*').each((_, el) => {
      const attribs = (el as any).attribs || {};
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
  private processLists($: cheerio.CheerioAPI): void {
    const listItems = $('li');
    let currentList: cheerio.Cheerio<any> | null = null;

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

  private generateExcerpt($: cheerio.CheerioAPI): string {
    const text = $('body').text().trim();
    const words = text.split(/\s+/).slice(0, 55);
    return words.join(' ') + (words.length >= 55 ? '...' : '');
  }

  private countWords($: cheerio.CheerioAPI): number {
    const text = $('body').text().trim();
    return text.split(/\s+/).filter((w) => w.length > 0).length;
  }

  // ─── LaTeX Conversion ─────────────────────────────────────────────

  /**
   * Convert extracted mathematical text (from OMath XML) into LaTeX
   * notation.  Handles Unicode symbols, fractions, sub/superscripts,
   * roots, named functions, integrals, limits, and matrices.
   */
  private convertToLatex(text: string): string {
    // Remove trailing equation numbers and normalize whitespace
    let latex = text.replace(/\(\d+\)$/, '').trim();
    latex = latex.replace(/\s+/g, ' ');
    latex = latex.replace(
      /[\u00A0\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]/g,
      ' '
    );

    // Unicode → LaTeX symbol map
    const symbolMap: Record<string, string> = {
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
    latex = latex.replace(
      /(\w+(?:\^\w+|\^{\w+})?)\s*\/\s*(\w+(?:\^\w+|\^{\w+})?)/g,
      '\\frac{$1}{$2}'
    );
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
      latex = latex.replace(
        new RegExp(`\\b${fn}\\s*\\(([^)]+)\\)`, 'g'),
        `\\${fn}($1)`
      );
      latex = latex.replace(
        new RegExp(`\\b${fn}\\s+([a-zA-Z0-9\\\\{}^_]+)`, 'g'),
        `\\${fn} $1`
      );
    }

    // Summation / product
    latex = latex.replace(
      /\\sum\s*\(([^)]+)\s+to\s+([^)]+)\)/g,
      '\\sum_{$1}^{$2}'
    );
    latex = latex.replace(
      /\\prod\s*\(([^)]+)\s+to\s+([^)]+)\)/g,
      '\\prod_{$1}^{$2}'
    );

    // Integrals
    latex = latex.replace(
      /\\int\s*([^{]+)\s+d([a-zA-Z])/g,
      '\\int $1 \\, d$2'
    );

    // Limits
    latex = latex.replace(
      /\\lim\s*([^{]+)→([^{]+)/g,
      '\\lim_{$1 \\to $2}'
    );

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
