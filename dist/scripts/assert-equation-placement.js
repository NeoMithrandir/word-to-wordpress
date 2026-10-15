"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const equationPlacement_1 = require("../lib/equationPlacement");
// ─── extractRawEquationZones: no more double-counting ──────────────────
// A bare inline <m:oMath> (not wrapped in <m:oMathPara>) — must be found
// exactly once, classified as inline (display: false).
{
    const xml = '<w:p><w:r><w:t>Η ταχύτητα </w:t></w:r>' +
        '<m:oMath><m:r><m:t>v</m:t></m:r></m:oMath>' +
        '<w:r><w:t> είναι σταθερή.</w:t></w:r></w:p>';
    const zones = (0, equationPlacement_1.extractRawEquationZones)(xml);
    assert_1.default.strictEqual(zones.length, 1, 'a single inline oMath must produce exactly one zone');
    assert_1.default.strictEqual(zones[0].display, false, 'a bare oMath (no oMathPara wrapper) must be inline');
    assert_1.default.strictEqual(zones[0].before, 'Η ταχύτητα');
    assert_1.default.strictEqual(zones[0].after, 'είναι σταθερή.');
}
// The actual bug report: an <m:oMathPara> wrapping one <m:oMath> must
// produce exactly ONE zone (display: true) — not two. The old
// implementation ran an oMath regex and an oMathPara regex independently
// over the whole document, so every display equation was extracted twice.
{
    const xml = '<w:p><w:r><w:t>Πριν.</w:t></w:r></w:p>' +
        '<w:p><m:oMathPara><m:oMath><m:r><m:t>E=mc2</m:t></m:r></m:oMath></m:oMathPara></w:p>' +
        '<w:p><w:r><w:t>Μετά.</w:t></w:r></w:p>';
    const zones = (0, equationPlacement_1.extractRawEquationZones)(xml);
    assert_1.default.strictEqual(zones.length, 1, 'an oMathPara wrapping one oMath must produce exactly one zone, not two (regression: previous double-counting bug)');
    assert_1.default.strictEqual(zones[0].display, true, 'a zone from oMathPara must be classified as display');
}
// A standalone display-equation paragraph (no text of its own on either
// side) must carry the previous paragraph's tail text as a fallback anchor.
{
    const xml = '<w:p><w:r><w:t>Η σχέση περιγράφεται παρακάτω.</w:t></w:r></w:p>' +
        '<w:p><m:oMathPara><m:oMath><m:r><m:t>x=y+1</m:t></m:r></m:oMath></m:oMathPara></w:p>' +
        '<w:p><w:r><w:t>Συνεχίζουμε την ανάλυση.</w:t></w:r></w:p>';
    const zones = (0, equationPlacement_1.extractRawEquationZones)(xml);
    assert_1.default.strictEqual(zones.length, 1);
    assert_1.default.strictEqual(zones[0].before, '');
    assert_1.default.strictEqual(zones[0].after, '');
    assert_1.default.strictEqual(zones[0].precedingParagraphTail, 'Η σχέση περιγράφεται παρακάτω.');
}
// Multiple equations in the same paragraph must each get their own
// before/after slice, not the whole paragraph's text repeated.
{
    const xml = '<w:p><w:r><w:t>Αρχή. </w:t></w:r>' +
        '<m:oMath><m:r><m:t>a</m:t></m:r></m:oMath>' +
        '<w:r><w:t> ενδιάμεσο </w:t></w:r>' +
        '<m:oMath><m:r><m:t>b</m:t></m:r></m:oMath>' +
        '<w:r><w:t> τέλος.</w:t></w:r></w:p>';
    const zones = (0, equationPlacement_1.extractRawEquationZones)(xml);
    assert_1.default.strictEqual(zones.length, 2);
    assert_1.default.strictEqual(zones[0].before, 'Αρχή.');
    assert_1.default.strictEqual(zones[0].after, 'ενδιάμεσο');
    assert_1.default.strictEqual(zones[1].before, 'ενδιάμεσο');
    assert_1.default.strictEqual(zones[1].after, 'τέλος.');
}
// XML entity decoding in surrounding text (Word escapes & < > in <w:t>).
{
    const xml = '<w:p><w:r><w:t>A &amp; B &lt;test&gt;</w:t></w:r>' +
        '<m:oMath><m:r><m:t>z</m:t></m:r></m:oMath>' +
        '<w:r><w:t>done</w:t></w:r></w:p>';
    const zones = (0, equationPlacement_1.extractRawEquationZones)(xml);
    assert_1.default.strictEqual(zones[0].before, 'A & B <test>');
}
console.log('equation zone extraction asserts passed');
// ─── buildAnchorPattern / placeEquationsInHtml ──────────────────────────
// Too little anchor text on both sides: refuse rather than risk a
// coincidental, wrong match.
assert_1.default.strictEqual((0, equationPlacement_1.buildAnchorPattern)('', ''), null, 'empty before/after must not produce a pattern');
assert_1.default.strictEqual((0, equationPlacement_1.buildAnchorPattern)('ab', 'cd'), null, 'anchor shorter than the minimum must be rejected');
// escapeRegExp must neutralize regex metacharacters from real prose
// (parentheses, periods, etc. are common right next to an equation).
{
    const pattern = (0, equationPlacement_1.escapeRegExp)('(see fig. 2)');
    assert_1.default.doesNotMatch('(see fig. 2)'.replace(/[.*+?^${}()|[\]\\]/g, ''), new RegExp(pattern));
    assert_1.default.match('(see fig. 2)', new RegExp(pattern));
}
function place(html, equations) {
    return (0, equationPlacement_1.placeEquationsInHtml)(html, equations);
}
// Inline equation lands exactly at the seam between its before/after text,
// as `$latex$` with clean spacing on both sides — not appended at the end.
{
    const html = '<p>Η ταχύτητα is constant.</p>';
    const result = place(html, [
        { latex: 'v', display: false, before: 'Η ταχύτητα', after: 'is constant.', precedingParagraphTail: '' },
    ]);
    assert_1.default.strictEqual(result.placedInline, 1);
    assert_1.default.strictEqual(result.appendedAtEnd, 0);
    assert_1.default.match(result.html, /^<p>Η ταχύτητα\s+\$v\$\s+is constant\.<\/p>$/);
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
    assert_1.default.strictEqual(result.placedInline, 1);
    assert_1.default.strictEqual(result.appendedAtEnd, 0);
    assert_1.default.strictEqual(result.html, '<p>Introduced by the following relation.<p>$$E=mc^2$$</p></p><p>We continue here.</p>');
}
// No usable anchor anywhere (first paragraph in the document, nothing to
// key off) — must still be included, safely appended at the end, never dropped.
{
    const html = '<p>Some unrelated paragraph.</p>';
    const result = place(html, [
        { latex: 'lost', display: true, before: '', after: '', precedingParagraphTail: '' },
    ]);
    assert_1.default.strictEqual(result.placedInline, 0);
    assert_1.default.strictEqual(result.appendedAtEnd, 1);
    assert_1.default.match(result.html, /\$\$lost\$\$/);
    assert_1.default.match(result.html, /Some unrelated paragraph\.[\s\S]*\$\$lost\$\$/);
}
// Ambiguous anchor (the same before/after text appears twice in the
// document) — must not guess; falls back to end-of-body instead of
// possibly landing in the wrong paragraph.
{
    const html = '<p>Ίδιο κείμενο εδώ.</p><p>Ίδιο κείμενο εδώ.</p>';
    const result = place(html, [
        { latex: 'ambiguous', display: false, before: 'Ίδιο κείμενο', after: 'εδώ.', precedingParagraphTail: '' },
    ]);
    assert_1.default.strictEqual(result.placedInline, 0, 'an anchor matching twice must not be used');
    assert_1.default.strictEqual(result.appendedAtEnd, 1);
}
// A formatting-tag transition sitting exactly at the seam (mammoth closes
// <strong> right where the equation used to be) must still match.
{
    const html = '<p><strong>Bold before</strong><em>italic after</em></p>';
    const result = place(html, [
        { latex: 'x', display: false, before: 'Bold before', after: 'italic after', precedingParagraphTail: '' },
    ]);
    assert_1.default.strictEqual(result.placedInline, 1);
    // The equation must land BETWEEN the tags, not still inside <strong> —
    // otherwise it renders bold, which is wrong (regression: the gap's
    // closing tag was previously placed after the equation instead of before it).
    assert_1.default.strictEqual(result.html, '<p><strong>Bold before</strong> $x$ <em>italic after</em></p>');
}
// Multiple equations in one document each place independently and in order.
{
    const html = '<p>First sentence here.</p><p>Second sentence here.</p>';
    const result = place(html, [
        { latex: 'a', display: false, before: 'First sentence', after: 'here.', precedingParagraphTail: '' },
        { latex: 'b', display: false, before: 'Second sentence', after: 'here.', precedingParagraphTail: '' },
    ]);
    assert_1.default.strictEqual(result.placedInline, 2);
    assert_1.default.strictEqual(result.appendedAtEnd, 0);
    assert_1.default.match(result.html, /^<p>First sentence\s+\$a\$\s+here\.<\/p><p>Second sentence\s+\$b\$\s+here\.<\/p>$/);
}
console.log('equation placement asserts passed');
//# sourceMappingURL=assert-equation-placement.js.map