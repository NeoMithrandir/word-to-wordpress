import assert from 'assert';
import { FALLBACK_LATIN_SLUG, toLatinSlug } from '../lib/latinSlug';
import {
  isSafeSimplificationSlug,
  normalizeSimplificationSlug
} from '../services/SimplificationsService';

const greek = 'νοητικα-πειραματα-με-ψυχρα-ατομα-το-2';
const encoded =
  '%ce%bd%ce%bf%ce%b7%cf%84%ce%b9%ce%ba%ce%b1-%cf%80%ce%b5%ce%b9%cf%81%ce%b1%ce%bc%ce%b1%cf%84%ce%b1-%ce%bc%ce%b5-%cf%88%cf%85%cf%87%cf%81%ce%b1-%ce%b1%cf%84%ce%bf%ce%bc%ce%b1-%cf%84%ce%bf-2';
const permalink = `https://arthra.inscience.gr/2026/08/30/${encoded}/`;

assert.strictEqual(isSafeSimplificationSlug(greek), true, 'Greek slug should be accepted');
assert.strictEqual(isSafeSimplificationSlug('hello-world-post'), true, 'hyphenated slug should be accepted');

assert.strictEqual(normalizeSimplificationSlug(permalink), greek, 'permalink should decode to last segment');
assert.strictEqual(isSafeSimplificationSlug(permalink), true, 'permalink should be accepted after normalize');

assert.strictEqual(normalizeSimplificationSlug(encoded), greek, 'encoded slug should decode');
assert.strictEqual(isSafeSimplificationSlug(encoded), true, 'encoded slug should be accepted after normalize');

assert.strictEqual(isSafeSimplificationSlug('..'), false, '.. should be rejected');
assert.strictEqual(isSafeSimplificationSlug('foo/bar/..'), false, 'trailing .. segment should be rejected');
assert.strictEqual(isSafeSimplificationSlug('%2e%2e'), false, 'encoded .. should be rejected');
assert.strictEqual(isSafeSimplificationSlug('%2e%2e%2fetc'), false, 'encoded path should be rejected');

const greekTitle = 'Νοητικά πειράματα με ψυχρά άτομα το 2';
assert.strictEqual(
  toLatinSlug(greekTitle),
  'noitika-peiramata-me-psychra-atoma-to-2',
  'Greek title should transliterate to kebab latin'
);
assert.strictEqual(
  toLatinSlug('Νοητικά πειράματα: με ψυχρά άτομα (το 2)!'),
  'noitika-peiramata-me-psychra-atoma-to-2',
  'punctuation should be stripped from Greek title'
);
assert.strictEqual(toLatinSlug(''), FALLBACK_LATIN_SLUG, 'empty title should fall back');
assert.strictEqual(toLatinSlug('   '), FALLBACK_LATIN_SLUG, 'whitespace title should fall back');
assert.strictEqual(toLatinSlug('!!!'), FALLBACK_LATIN_SLUG, 'punctuation-only title should fall back');
assert.strictEqual(
  toLatinSlug('Hello, World! 2024'),
  'hello-world-2024',
  'already-latin title should be kebab-normalized'
);
assert.strictEqual(
  toLatinSlug('hello-world-post'),
  'hello-world-post',
  'already-latin kebab slug should stay unchanged'
);
assert.strictEqual(toLatinSlug('του κόσμου'), 'tou-kosmou', 'ου digraph should become ou');

console.log('slug normalization asserts passed');
