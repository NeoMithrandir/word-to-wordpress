/**
 * Footnote token rendering shared between the DocumentProcessor pipeline
 * (which stores the plain `[^N]` token in the WordPress post body) and
 * the local "Save as HTML" export (which never passes through the
 * InScience-v2 Astro renderer, so it must do its own rendering).
 *
 * Astro's `processFootnotes` (inscience-v2 src/lib/utils.ts) converts the
 * same literal `[^N]` token into `<sup class="footnote-ref"><a href="#fn-N"
 * id="fnref-N">N</a></sup>` at render time. Keeping the token in the stored
 * WordPress content (rather than baking in the final `<sup>/<a>` markup)
 * means the live site gets that CSS class fresh from Astro's own render
 * step — word-to-wordpress's `cleanHtml()` strips all `class` attributes
 * before publish, so a class written here would never survive anyway.
 *
 * The footnote body itself (`id="fn-N"`) is untouched by Astro; it must
 * already carry the right id in the HTML we publish. DocumentProcessor
 * writes that directly (see `extractFootnotes`).
 */
/**
 * Replace every `[^N]` token with a clickable superscript link to `#fn-N`,
 * mirroring exactly what the Astro article page renders. Used only for
 * word-to-wordpress's own local HTML export, where there is no downstream
 * Astro render step to do this.
 */
export declare function renderFootnoteTokens(html: string): string;
//# sourceMappingURL=footnotes.d.ts.map