/** Fallback when a title has no usable letters or digits after transliteration. */
export declare const FALLBACK_LATIN_SLUG = "post";
/**
 * Build a WordPress-safe ASCII slug from a title.
 * Greek is transliterated, punctuation is stripped, spaces become hyphens.
 */
export declare function toLatinSlug(title: string): string;
//# sourceMappingURL=latinSlug.d.ts.map