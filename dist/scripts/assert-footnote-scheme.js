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
const assert_1 = __importDefault(require("assert"));
const cheerio = __importStar(require("cheerio"));
const footnotes_1 = require("../lib/footnotes");
// Mirrors DocumentProcessor.extractFootnotes' cheerio manipulation directly,
// without needing a real .docx fixture, to pin the exact markup contract
// InScience-v2's Astro pipeline depends on:
//   - in-text token is literal `[^N]`
//   - footnote/endnote body carries id="fn-N"
//   - the <li> stays inside its <ol> (not hoisted into a <div>)
//   - footnotes and endnotes share one sequential numbering, even though
//     Word numbers them separately (both can have their own "1")
function extractFootnotesLikeDocumentProcessor(html) {
    const $ = cheerio.load(html);
    const footnotes = [];
    const sequentialIdByOriginalKey = new Map();
    let nextSequentialId = 1;
    let legacyFallbackCounter = 1;
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
    $('li[id^="doc-footnote-"], li[id^="doc-endnote-"], div[id^="_ftn"]').each((_, el) => {
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
        const id = sequentialIdByOriginalKey.get(originalKey) ?? (nextSequentialId++).toString();
        footnotes.push({ id: `fn-${id}`, text, backRef: `fnref-${id}` });
        $el.replaceWith(`<li id="fn-${id}">${text} <a href="#fnref-${id}">↩</a></li>`);
    });
    return { content: $('body').html() || '', footnotes };
}
const mammothStyleHtml = '<p>Το πείραμα έδειξε ένα αποτέλεσμα.' +
    '<sup><a href="#doc-footnote-1" id="doc-footnote-ref-1">[1]</a></sup></p>' +
    '<ol><li id="doc-footnote-1"><p>Πηγή: εργαστηριακή καταγραφή.</p></li></ol>';
const { content, footnotes } = extractFootnotesLikeDocumentProcessor(mammothStyleHtml);
assert_1.default.match(content, /\[\^1\]/, 'in-text marker should be the literal [^1] token');
assert_1.default.doesNotMatch(content, /<a[^>]+href="#doc-footnote-1"/, 'old anchor-based marker must not survive');
assert_1.default.match(content, /<li id="fn-1">/, 'footnote body must carry id="fn-1"');
assert_1.default.match(content, /<ol>[\s\S]*<li id="fn-1">[\s\S]*<\/ol>/, 'footnote <li> must stay inside its <ol>');
assert_1.default.match(content, /href="#fnref-1"/, 'backref link must target #fnref-1');
assert_1.default.deepStrictEqual(footnotes, [{ id: 'fn-1', text: 'Πηγή: εργαστηριακή καταγραφή.', backRef: 'fnref-1' }], 'Footnote metadata should use the fn-N / fnref-N scheme');
// Regression coverage for a real bug report: a document using Word's
// ENDNOTE feature (mammoth ids "doc-endnote-N", not "doc-footnote-N") was
// silently extracting zero notes, because the old code only ever looked
// for the footnote prefix. Confirmed against mammoth's own source
// (node_modules/mammoth/lib/document-to-html.js referentHtmlId): footnotes
// and endnotes get different id prefixes even though both render the same
// "[N]" superscript marker in the converted HTML.
const endnoteOnlyHtml = '<p>Η ταχύτητα περιστροφής ξεπερνά την αναμενόμενη.' +
    '<sup><a href="#doc-endnote-1" id="doc-endnote-ref-1">[1]</a></sup></p>' +
    '<ol><li id="doc-endnote-1"><p>Rubin, V., Ford, K. (1970). Rotation of Andromeda.</p></li></ol>';
const endnoteResult = extractFootnotesLikeDocumentProcessor(endnoteOnlyHtml);
assert_1.default.strictEqual(endnoteResult.footnotes.length, 1, 'a document using only Word endnotes must not report zero notes');
assert_1.default.match(endnoteResult.content, /\[\^1\]/, 'endnote in-text marker should also become [^1]');
assert_1.default.match(endnoteResult.content, /<li id="fn-1">/, 'endnote body should also land at id="fn-1"');
// Mixed document: Word numbers footnotes and endnotes independently, so a
// "footnote 1" and an "endnote 1" can coexist. They must not collide on
// the same final fn-1 id — each needs its own sequential number.
const mixedHtml = '<p>Πρώτη πρόταση.<sup><a href="#doc-footnote-1" id="doc-footnote-ref-1">[1]</a></sup></p>' +
    '<p>Δεύτερη πρόταση.<sup><a href="#doc-endnote-1" id="doc-endnote-ref-1">[1]</a></sup></p>' +
    '<ol><li id="doc-footnote-1"><p>Σημείωση υποσελίδιου.</p></li></ol>' +
    '<ol><li id="doc-endnote-1"><p>Βιβλιογραφική αναφορά.</p></li></ol>';
const mixedResult = extractFootnotesLikeDocumentProcessor(mixedHtml);
assert_1.default.strictEqual(mixedResult.footnotes.length, 2, 'both the footnote and the endnote must be captured');
assert_1.default.deepStrictEqual(mixedResult.footnotes.map((f) => f.id), ['fn-1', 'fn-2'], 'a footnote "1" and an endnote "1" must not collide on the same fn-N id');
assert_1.default.match(mixedResult.content, /\[\^1\][\s\S]*\[\^2\]/, 'markers should stay in document order');
// renderFootnoteTokens (used by LocalSaveService's standalone HTML export)
// must produce the exact same class/id shape Astro's processFootnotes injects
// at render time, so the two paths stay visually consistent.
const rendered = (0, footnotes_1.renderFootnoteTokens)('<p>Κείμενο.[^1] Άλλο.[^12]</p>');
assert_1.default.strictEqual(rendered, '<p>Κείμενο.<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup> Άλλο.<sup class="footnote-ref"><a href="#fn-12" id="fnref-12">12</a></sup></p>', 'renderFootnoteTokens should match Astro processFootnotes output exactly');
assert_1.default.strictEqual((0, footnotes_1.renderFootnoteTokens)('no tokens here'), 'no tokens here', 'text without [^N] tokens should pass through unchanged');
console.log('footnote scheme asserts passed');
//# sourceMappingURL=assert-footnote-scheme.js.map