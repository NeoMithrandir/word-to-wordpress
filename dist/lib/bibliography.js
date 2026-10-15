"use strict";
/**
 * Turn parsed bibliography citations into the plain-text numbered format
 * the InScience-v2 Astro frontend expects in the ACF `article_references`
 * field (one `[N] text` line per reference — see Bibliography.astro /
 * parseBibliography in inscience-v2's src/lib/utils.ts).
 *
 * This does NOT touch the in-text "(Author, Year)" anchor links that
 * DocumentProcessor already writes into the body HTML — those keep working
 * as same-page navigation. This is a second, independent representation of
 * the same bibliography, written to ACF so the Astro article page can render
 * its own numbered "Βιβλιογραφία" section with DOI/URL link detection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildNumberedBibliography = buildNumberedBibliography;
/**
 * Build "[1] first entry\n[2] second entry…" from citations in their
 * original document order. Empty/whitespace-only entries are skipped.
 * Returns an empty string when there is nothing to write (callers should
 * omit the ACF field rather than send blank text).
 */
function buildNumberedBibliography(citations) {
    if (!citations || citations.length === 0)
        return '';
    const lines = [];
    let number = 1;
    for (const citation of citations) {
        const text = citation.text?.trim();
        if (!text)
            continue;
        lines.push(`[${number}] ${text}`);
        number += 1;
    }
    return lines.join('\n');
}
//# sourceMappingURL=bibliography.js.map