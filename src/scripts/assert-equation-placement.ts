import assert from 'assert';
import {
  buildAnchorPattern,
  escapeRegExp,
  extractRawEquationZones,
  placeEquationsInHtml,
  wrapBareLatexInHtml,
  type PositionedEquation,
} from '../lib/equationPlacement';

// ─── extractRawEquationZones: no more double-counting ──────────────────

// A bare inline <m:oMath> (not wrapped in <m:oMathPara>) — must be found
// exactly once, classified as inline (display: false).
{
  const xml =
    '<w:p><w:r><w:t>Η ταχύτητα </w:t></w:r>' +
    '<m:oMath><m:r><m:t>v</m:t></m:r></m:oMath>' +
    '<w:r><w:t> είναι σταθερή.</w:t></w:r></w:p>';
  const zones = extractRawEquationZones(xml);
  assert.strictEqual(zones.length, 1, 'a single inline oMath must produce exactly one zone');
  assert.strictEqual(zones[0].display, false, 'a bare oMath (no oMathPara wrapper) must be inline');
  assert.strictEqual(zones[0].before, 'Η ταχύτητα');
  assert.strictEqual(zones[0].after, 'είναι σταθερή.');
}

// The actual bug report: an <m:oMathPara> wrapping one <m:oMath> must
// produce exactly ONE zone (display: true) — not two. The old
// implementation ran an oMath regex and an oMathPara regex independently
// over the whole document, so every display equation was extracted twice.
{
  const xml =
    '<w:p><w:r><w:t>Πριν.</w:t></w:r></w:p>' +
    '<w:p><m:oMathPara><m:oMath><m:r><m:t>E=mc2</m:t></m:r></m:oMath></m:oMathPara></w:p>' +
    '<w:p><w:r><w:t>Μετά.</w:t></w:r></w:p>';
  const zones = extractRawEquationZones(xml);
  assert.strictEqual(
    zones.length,
    1,
    'an oMathPara wrapping one oMath must produce exactly one zone, not two (regression: previous double-counting bug)'
  );
  assert.strictEqual(zones[0].display, true, 'a zone from oMathPara must be classified as display');
}

// A standalone display-equation paragraph (no text of its own on either
// side) must carry the previous paragraph's tail text as a fallback anchor.
{
  const xml =
    '<w:p><w:r><w:t>Η σχέση περιγράφεται παρακάτω.</w:t></w:r></w:p>' +
    '<w:p><m:oMathPara><m:oMath><m:r><m:t>x=y+1</m:t></m:r></m:oMath></m:oMathPara></w:p>' +
    '<w:p><w:r><w:t>Συνεχίζουμε την ανάλυση.</w:t></w:r></w:p>';
  const zones = extractRawEquationZones(xml);
  assert.strictEqual(zones.length, 1);
  assert.strictEqual(zones[0].before, '');
  assert.strictEqual(zones[0].after, '');
  assert.strictEqual(zones[0].precedingParagraphTail, 'Η σχέση περιγράφεται παρακάτω.');
}

// Multiple equations in the same paragraph must each get their own
// before/after slice, not the whole paragraph's text repeated.
{
  const xml =
    '<w:p><w:r><w:t>Αρχή. </w:t></w:r>' +
    '<m:oMath><m:r><m:t>a</m:t></m:r></m:oMath>' +
    '<w:r><w:t> ενδιάμεσο </w:t></w:r>' +
    '<m:oMath><m:r><m:t>b</m:t></m:r></m:oMath>' +
    '<w:r><w:t> τέλος.</w:t></w:r></w:p>';
  const zones = extractRawEquationZones(xml);
  assert.strictEqual(zones.length, 2);
  assert.strictEqual(zones[0].before, 'Αρχή.');
  assert.strictEqual(zones[0].after, 'ενδιάμεσο');
  assert.strictEqual(zones[1].before, 'ενδιάμεσο');
  assert.strictEqual(zones[1].after, 'τέλος.');
}

// XML entity decoding in surrounding text (Word escapes & < > in <w:t>).
{
  const xml =
    '<w:p><w:r><w:t>A &amp; B &lt;test&gt;</w:t></w:r>' +
    '<m:oMath><m:r><m:t>z</m:t></m:r></m:oMath>' +
    '<w:r><w:t>done</w:t></w:r></w:p>';
  const zones = extractRawEquationZones(xml);
  assert.strictEqual(zones[0].before, 'A & B <test>');
}

console.log('equation zone extraction asserts passed');

// ─── buildAnchorPattern / placeEquationsInHtml ──────────────────────────

// Too little anchor text on both sides: refuse rather than risk a
// coincidental, wrong match.
assert.strictEqual(buildAnchorPattern('', ''), null, 'empty before/after must not produce a pattern');
assert.strictEqual(buildAnchorPattern('ab', 'cd'), null, 'anchor shorter than the minimum must be rejected');

// escapeRegExp must neutralize regex metacharacters from real prose
// (parentheses, periods, etc. are common right next to an equation).
{
  const pattern = escapeRegExp('(see fig. 2)');
  assert.doesNotMatch('(see fig. 2)'.replace(/[.*+?^${}()|[\]\\]/g, ''), new RegExp(pattern));
  assert.match('(see fig. 2)', new RegExp(pattern));
}

function place(html: string, equations: PositionedEquation[]) {
  return placeEquationsInHtml(html, equations);
}

// Inline equation lands exactly at the seam between its before/after text,
// as `$latex$` with clean spacing on both sides — not appended at the end.
{
  const html = '<p>Η ταχύτητα is constant.</p>';
  const result = place(html, [
    { latex: 'v', display: false, before: 'Η ταχύτητα', after: 'is constant.', precedingParagraphTail: '' },
  ]);
  assert.strictEqual(result.placedInline, 1);
  assert.strictEqual(result.appendedAtEnd, 0);
  assert.match(result.html, /^<p>Η ταχύτητα\s+\$v\$\s+is constant\.<\/p>$/);
}

// Display equation (from oMathPara) becomes its own <p>$$...$$</p>, spliced
// right after the paragraph it followed in the original document — not
// dumped at the very end of the article.
{
  const html = '<p>Introduced by the following relation.</p><p>We continue here.</p>';
  const result = place(html, [
    {
      latex: 'E=mc^2',
      display: true,
      before: '',
      after: '',
      precedingParagraphTail: 'Introduced by the following relation.',
    },
  ]);
  assert.strictEqual(result.placedInline, 1);
  assert.strictEqual(result.appendedAtEnd, 0);
  assert.strictEqual(
    result.html,
    '<p>Introduced by the following relation.<p>$$E=mc^2$$</p></p><p>We continue here.</p>'
  );
}

// No usable anchor anywhere (first paragraph in the document, nothing to
// key off) — must still be included, safely appended at the end, never dropped.
{
  const html = '<p>Some unrelated paragraph.</p>';
  const result = place(html, [
    { latex: 'lost', display: true, before: '', after: '', precedingParagraphTail: '' },
  ]);
  assert.strictEqual(result.placedInline, 0);
  assert.strictEqual(result.appendedAtEnd, 1);
  assert.match(result.html, /\$\$lost\$\$/);
  assert.match(result.html, /Some unrelated paragraph\.[\s\S]*\$\$lost\$\$/);
}

// Ambiguous anchor (the same before/after text appears twice in the
// document) — must not guess; falls back to end-of-body instead of
// possibly landing in the wrong paragraph.
{
  const html = '<p>Ίδιο κείμενο εδώ.</p><p>Ίδιο κείμενο εδώ.</p>';
  const result = place(html, [
    { latex: 'ambiguous', display: false, before: 'Ίδιο κείμενο', after: 'εδώ.', precedingParagraphTail: '' },
  ]);
  assert.strictEqual(result.placedInline, 0, 'an anchor matching twice must not be used');
  assert.strictEqual(result.appendedAtEnd, 1);
}

// A formatting-tag transition sitting exactly at the seam (mammoth closes
// <strong> right where the equation used to be) must still match.
{
  const html = '<p><strong>Bold before</strong><em>italic after</em></p>';
  const result = place(html, [
    { latex: 'x', display: false, before: 'Bold before', after: 'italic after', precedingParagraphTail: '' },
  ]);
  assert.strictEqual(result.placedInline, 1);
  // The equation must land BETWEEN the tags, not still inside <strong> —
  // otherwise it renders bold, which is wrong (regression: the gap's
  // closing tag was previously placed after the equation instead of before it).
  assert.strictEqual(
    result.html,
    '<p><strong>Bold before</strong> $x$ <em>italic after</em></p>'
  );
}

// Multiple equations in one document each place independently and in order.
{
  const html = '<p>First sentence here.</p><p>Second sentence here.</p>';
  const result = place(html, [
    { latex: 'a', display: false, before: 'First sentence', after: 'here.', precedingParagraphTail: '' },
    { latex: 'b', display: false, before: 'Second sentence', after: 'here.', precedingParagraphTail: '' },
  ]);
  assert.strictEqual(result.placedInline, 2);
  assert.strictEqual(result.appendedAtEnd, 0);
  assert.match(
    result.html,
    /^<p>First sentence\s+\$a\$\s+here\.<\/p><p>Second sentence\s+\$b\$\s+here\.<\/p>$/
  );
}

console.log('equation placement asserts passed');

// ─── wrapBareLatexInHtml: Astro/KaTeX can only render $...$ / $$...$$ ──

{
  const html = '<p>ενέργεια x\\rightarrow y γίνεται πολύ μεγάλη.</p>';
  const wrapped = wrapBareLatexInHtml(html);
  assert.match(
    wrapped,
    /\$x\\rightarrow y\$/,
    'bare x\\rightarrow y must be wrapped in $...$ so Astro KaTeX can render it'
  );
  assert.doesNotMatch(
    wrapped,
    /[^$]x\\rightarrow y[^$]/,
    'the raw command must not remain outside math delimiters'
  );
}

{
  const html = '<p>αντίδραση x\\rightarrow\\gamma και #8211;\\rightharpoonup\\gamma/\\gamma.</p>';
  const wrapped = wrapBareLatexInHtml(html);
  assert.match(wrapped, /\$x\\rightarrow\\gamma\$/, 'x\\rightarrow\\gamma must be wrapped');
  assert.match(
    wrapped,
    /\$[^$]*\\rightharpoonup\\gamma\/\\gamma\$/,
    'broken #8211; leftover plus \\rightharpoonup must land inside $...$'
  );
  assert.doesNotMatch(wrapped, /#8211;/, 'broken numeric entity #8211; must not leak into the HTML');
}

{
  const html = '<p>The freeze-out of dark matter is well known.</p>';
  assert.strictEqual(
    wrapBareLatexInHtml(html),
    html,
    'ordinary hyphenated prose like freeze-out must not be wrapped as math'
  );
}

{
  const html = '<p>Η σχέση $x \\rightarrow y$ μένει ως έχει.</p>';
  assert.strictEqual(
    wrapBareLatexInHtml(html),
    html,
    'already-delimited $...$ math must not be double-wrapped'
  );
}

{
  const html = '<p>Inline \\(E=mc^2\\) and display \\[a+b\\].</p>';
  const wrapped = wrapBareLatexInHtml(html);
  assert.match(wrapped, /\$E=mc\^2\$/, '\\\\(...\\\\) must become $...$ which Astro actually renders');
  assert.match(wrapped, /\$\$a\+b\$\$/, '\\\\[...\\\\] must become $$...$$');
}

// Exact strings from the freeze-out / annihilation screenshot.
{
  const html =
    '<p>μορφή x ↔ y, όπου x δύο στοιχειώδη σωματίδια.</p>' +
    '<p>εξίσωσηςx\\rightharpoonup yγίνεται μόνο προς τη μία φορά.</p>' +
    '<p>Αν ενέργεια x\\rightharpoonup\\gamma γίνεται πολύ μεγάλη, e + e #8211; \\rightharpoonup\\gamma/\\gamma.</p>';
  const wrapped = wrapBareLatexInHtml(html);
  assert.match(
    wrapped,
    /\$x \\leftrightarrow y\$/,
    'Unicode x ↔ y must become $x \\leftrightarrow y$ (Astro ignores bare arrows)'
  );
  assert.match(
    wrapped,
    /\$x\\rightharpoonup y\$/,
    'screenshot x\\rightharpoonup y glued to Greek must be wrapped'
  );
  assert.match(
    wrapped,
    /\$x\\rightharpoonup\\gamma\$/,
    'screenshot x\\rightharpoonup\\gamma must be wrapped'
  );
  assert.match(
    wrapped,
    /\$[^$]*\\rightharpoonup\\gamma\/\\gamma\$/,
    'screenshot #8211; \\rightharpoonup\\gamma/\\gamma must land inside $...$'
  );
  assert.doesNotMatch(wrapped, /#8211;/, 'screenshot leftover #8211; must not leak');
  assert.doesNotMatch(
    wrapped,
    /[^$]x\\rightharpoonup y[^$]/,
    'raw x\\rightharpoonup y must not remain outside math delimiters'
  );
}

console.log('bare latex wrapping asserts passed');
