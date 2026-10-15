// Run: npx tsx client/src/lib/reviewDiff.check.ts
import assert from 'node:assert/strict';
import { buildReviewDiff, diffLines, ReviewSnapshot } from './reviewDiff';

const lines = diffLines(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e']);
assert.deepEqual(
  lines.map((l) => `${l.type}:${l.text}`),
  ['same:a', 'del:b', 'add:x', 'same:c', 'same:d', 'add:e']
);

const base: ReviewSnapshot = {
  title: 'T',
  excerpt: 'E',
  content: '<p>one</p><p>two</p><p>three</p>',
  footnotes: [],
  citations: [],
  images: [{ id: 'i1', filename: 'a', alt: 'x', title: 't' }],
};
assert.equal(buildReviewDiff(base, { ...base }).length, 0, 'identical snapshots have no diff');

const sections = buildReviewDiff(base, {
  ...base,
  content: '<p>one</p><p>2</p><p>three</p>',
  images: [{ id: 'i1', filename: 'a', alt: 'new alt', title: 't' }],
});
assert.deepEqual(sections.map((s) => s.label), ['Article HTML', 'Images']);
assert.ok(sections[0].lines.some((l) => l.type === 'del' && l.text === '<p>two</p>'));
assert.ok(sections[0].lines.some((l) => l.type === 'add' && l.text === '<p>2</p>'));
console.log('reviewDiff ok');
