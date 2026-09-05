/** Fallback when a title has no usable letters or digits after transliteration. */
export const FALLBACK_LATIN_SLUG = 'post';

const MAX_SLUG_LENGTH = 80;

/**
 * Modern Greek letters → Latin. Accents are stripped via NFD before lookup.
 * Digraph ου is handled separately so "μου" becomes "mou", not "my".
 */
const GREEK_CHAR_MAP: Record<string, string> = {
  α: 'a',
  β: 'v',
  γ: 'g',
  δ: 'd',
  ε: 'e',
  ζ: 'z',
  η: 'i',
  θ: 'th',
  ι: 'i',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  ο: 'o',
  π: 'p',
  ρ: 'r',
  σ: 's',
  ς: 's',
  τ: 't',
  υ: 'y',
  φ: 'f',
  χ: 'ch',
  ψ: 'ps',
  ω: 'o'
};

/**
 * Build a WordPress-safe ASCII slug from a title.
 * Greek is transliterated, punctuation is stripped, spaces become hyphens.
 */
export function toLatinSlug(title: string): string {
  let value = (title ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  value = value.toLowerCase().replace(/ου/g, 'ou');

  let mapped = '';
  for (const char of value) {
    mapped += GREEK_CHAR_MAP[char] ?? char;
  }

  const slug = mapped
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');

  return slug || FALLBACK_LATIN_SLUG;
}
