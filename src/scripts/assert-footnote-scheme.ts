import assert from 'assert';
import * as cheerio from 'cheerio';
import {
  isNotesHeading,
  promotePlainFootnoteMarkers,
  renderFootnoteTokens,
  stampTypedFootnoteBodies,
} from '../lib/footnotes';

// Mirrors DocumentProcessor.extractFootnotes' cheerio manipulation directly,
// without needing a real .docx fixture, to pin the exact markup contract
// InScience-v2's Astro pipeline depends on:
//   - in-text token is literal `[^N]`
//   - footnote/endnote body carries id="fn-N"
//   - the <li> stays inside its <ol> (not hoisted into a <div>)
//   - footnotes and endnotes share one sequential numbering, even though
//     Word numbers them separately (both can have their own "1")
function extractFootnotesLikeDocumentProcessor(html: string): {
  content: string;
  footnotes: Array<{ id: string; text: string; backRef: string }>;
} {
  const $ = cheerio.load(html);
  const footnotes: Array<{ id: string; text: string; backRef: string }> = [];
  const sequentialIdByOriginalKey = new Map<string, string>();
  let nextSequentialId = 1;
  let legacyFallbackCounter = 1;

  $('a[href^="#doc-footnote-"], a[href^="#doc-endnote-"], a[href^="#_ftn"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    let originalKey: string;
    if (href.startsWith('#doc-footnote-')) {
      originalKey = `footnote-${href.replace('#doc-footnote-', '')}`;
    } else if (href.startsWith('#doc-endnote-')) {
      originalKey = `endnote-${href.replace('#doc-endnote-', '')}`;
    } else {
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
    if (!text) return;
    const elId = $el.attr('id') || '';
    let originalKey: string;
    if (elId.startsWith('doc-footnote-')) {
      originalKey = `footnote-${elId.replace('doc-footnote-', '')}`;
    } else if (elId.startsWith('doc-endnote-')) {
      originalKey = `endnote-${elId.replace('doc-endnote-', '')}`;
    } else {
      originalKey = `ftn-${elId.replace('_ftn', '')}`;
    }
    const id = sequentialIdByOriginalKey.get(originalKey) ?? (nextSequentialId++).toString();
    footnotes.push({ id: `fn-${id}`, text, backRef: `fnref-${id}` });
    $el.replaceWith(`<li id="fn-${id}">${text} <a href="#fnref-${id}">↩</a></li>`);
  });

  const bodyHtml = $('body').html();
  if (bodyHtml) {
    const promoted = promotePlainFootnoteMarkers(bodyHtml);
    if (promoted !== bodyHtml) $('body').html(promoted);
  }

  const stamped = stampTypedFootnoteBodies($, footnotes);
  return { content: $('body').html() || '', footnotes: stamped };
}

const mammothStyleHtml =
  '<p>Το πείραμα έδειξε ένα αποτέλεσμα.' +
  '<sup><a href="#doc-footnote-1" id="doc-footnote-ref-1">[1]</a></sup></p>' +
  '<ol><li id="doc-footnote-1"><p>Πηγή: εργαστηριακή καταγραφή.</p></li></ol>';

const { content, footnotes } = extractFootnotesLikeDocumentProcessor(mammothStyleHtml);

assert.match(content, /\[\^1\]/, 'in-text marker should be the literal [^1] token');
assert.doesNotMatch(content, /<a[^>]+href="#doc-footnote-1"/, 'old anchor-based marker must not survive');
assert.match(content, /<li id="fn-1">/, 'footnote body must carry id="fn-1"');
assert.match(content, /<ol>[\s\S]*<li id="fn-1">[\s\S]*<\/ol>/, 'footnote <li> must stay inside its <ol>');
assert.match(content, /href="#fnref-1"/, 'backref link must target #fnref-1');

assert.deepStrictEqual(
  footnotes,
  [{ id: 'fn-1', text: 'Πηγή: εργαστηριακή καταγραφή.', backRef: 'fnref-1' }],
  'Footnote metadata should use the fn-N / fnref-N scheme'
);

// Regression coverage for a real bug report: a document using Word's
// ENDNOTE feature (mammoth ids "doc-endnote-N", not "doc-footnote-N") was
// silently extracting zero notes, because the old code only ever looked
// for the footnote prefix. Confirmed against mammoth's own source
// (node_modules/mammoth/lib/document-to-html.js referentHtmlId): footnotes
// and endnotes get different id prefixes even though both render the same
// "[N]" superscript marker in the converted HTML.
const endnoteOnlyHtml =
  '<p>Η ταχύτητα περιστροφής ξεπερνά την αναμενόμενη.' +
  '<sup><a href="#doc-endnote-1" id="doc-endnote-ref-1">[1]</a></sup></p>' +
  '<ol><li id="doc-endnote-1"><p>Rubin, V., Ford, K. (1970). Rotation of Andromeda.</p></li></ol>';

const endnoteResult = extractFootnotesLikeDocumentProcessor(endnoteOnlyHtml);
assert.strictEqual(
  endnoteResult.footnotes.length,
  1,
  'a document using only Word endnotes must not report zero notes'
);
assert.match(endnoteResult.content, /\[\^1\]/, 'endnote in-text marker should also become [^1]');
assert.match(endnoteResult.content, /<li id="fn-1">/, 'endnote body should also land at id="fn-1"');

// Mixed document: Word numbers footnotes and endnotes independently, so a
// "footnote 1" and an "endnote 1" can coexist. They must not collide on
// the same final fn-1 id — each needs its own sequential number.
const mixedHtml =
  '<p>Πρώτη πρόταση.<sup><a href="#doc-footnote-1" id="doc-footnote-ref-1">[1]</a></sup></p>' +
  '<p>Δεύτερη πρόταση.<sup><a href="#doc-endnote-1" id="doc-endnote-ref-1">[1]</a></sup></p>' +
  '<ol><li id="doc-footnote-1"><p>Σημείωση υποσελίδιου.</p></li></ol>' +
  '<ol><li id="doc-endnote-1"><p>Βιβλιογραφική αναφορά.</p></li></ol>';

const mixedResult = extractFootnotesLikeDocumentProcessor(mixedHtml);
assert.strictEqual(mixedResult.footnotes.length, 2, 'both the footnote and the endnote must be captured');
assert.deepStrictEqual(
  mixedResult.footnotes.map((f) => f.id),
  ['fn-1', 'fn-2'],
  'a footnote "1" and an endnote "1" must not collide on the same fn-N id'
);
assert.match(mixedResult.content, /\[\^1\][\s\S]*\[\^2\]/, 'markers should stay in document order');

// renderFootnoteTokens (used by LocalSaveService's standalone HTML export)
// must produce the exact same class/id shape Astro's processFootnotes injects
// at render time, so the two paths stay visually consistent.
const rendered = renderFootnoteTokens('<p>Κείμενο.[^1] Άλλο.[^12]</p>');
assert.strictEqual(
  rendered,
  '<p>Κείμενο.<sup class="footnote-ref"><a href="#fn-1" id="fnref-1">1</a></sup> Άλλο.<sup class="footnote-ref"><a href="#fn-12" id="fnref-12">12</a></sup></p>',
  'renderFootnoteTokens should match Astro processFootnotes output exactly'
);
assert.strictEqual(
  renderFootnoteTokens('no tokens here'),
  'no tokens here',
  'text without [^N] tokens should pass through unchanged'
);

assert.strictEqual(
  promotePlainFootnoteMarkers('<p>δεν ενεργοποιεί<sup>[1]</sup>.</p>'),
  '<p>δεν ενεργοποιεί[^1].</p>',
  'typed superscript [1] must become the [^1] token Astro links'
);
assert.strictEqual(
  promotePlainFootnoteMarkers('<p>της σκοτεινής ύλης[2] είναι η παρατήρηση.</p>'),
  '<p>της σκοτεινής ύλης[^2] είναι η παρατήρηση.</p>',
  'bare [N] immediately after a word must become [^N]'
);
assert.strictEqual(
  promotePlainFootnoteMarkers('<p>Κείμενο.[^1] Άλλο.[^12]</p>'),
  '<p>Κείμενο.[^1] Άλλο.[^12]</p>',
  'already-tokenized [^N] markers must not be rewritten'
);
assert.strictEqual(
  promotePlainFootnoteMarkers('<p>[1] Darwin, C. (1859). On the Origin of Species.</p>'),
  '<p>[1] Darwin, C. (1859). On the Origin of Species.</p>',
  'bibliography lines that start with [N] must stay numbered references, not footnote tokens'
);
assert.match(
  renderFootnoteTokens(promotePlainFootnoteMarkers('<p>ενεργοποιεί[1]</p>')),
  /<a href="#fn-1" id="fnref-1">1<\/a>/,
  'promoted [1] markers must render as a clickable #fn-1 anchor'
);

assert.strictEqual(isNotesHeading('Σημειώσεις'), true);
assert.strictEqual(isNotesHeading('ΥΠΟΣΗΜΕΙΩΣΕΙΣ'), true);
assert.strictEqual(isNotesHeading('Notes'), true);
assert.strictEqual(
  isNotesHeading('Οι σημειώσεις αυτές αναπτύσσονται στο πρώτο μέρος.'),
  false,
  'ordinary sentences that mention notes must not become headings'
);

// The actual published-article failure: in-text [1] became [^1], but the
// typed note list at the bottom never received id="fn-1", so Astro's
// href="#fn-1" jumped nowhere.
const typedNotesHtml =
  '<p>δεν ενεργοποιεί[1]. Η κύρια ένδειξη[2].</p>' +
  '<h2>Σημειώσεις</h2>' +
  '<p>[1] Πηγή: Rubin, V., Ford, K. (1970).</p>' +
  '<p>[2] Βλ. προηγούμενο άρθρο.</p>' +
  '<h2>Βιβλιογραφία</h2>' +
  '<p>[1] Darwin, C. (1859). On the Origin of Species.</p>';

const typedResult = extractFootnotesLikeDocumentProcessor(typedNotesHtml);
assert.match(typedResult.content, /\[\^1\]/, 'typed in-text [1] must become [^1]');
assert.match(typedResult.content, /\[\^2\]/, 'typed in-text [2] must become [^2]');
assert.match(typedResult.content, /id="fn-1"/, 'first typed note body must carry id="fn-1"');
assert.match(typedResult.content, /id="fn-2"/, 'second typed note body must carry id="fn-2"');

const $typed = cheerio.load(renderFootnoteTokens(typedResult.content));
const inTextHref = $typed('a[id="fnref-1"]').attr('href');
assert.strictEqual(inTextHref, '#fn-1', 'in-text marker href must be #fn-1');
assert.strictEqual(
  $typed(inTextHref || '').length,
  1,
  'in-text href must resolve to exactly one bottom-note id'
);
assert.strictEqual(
  $typed('#fn-1').text().includes('Rubin'),
  true,
  'fn-1 must be the notes-section body, not the bibliography line'
);
assert.strictEqual(
  $typed('#fn-1').is($typed('h2:contains("Βιβλιογραφία")').next()),
  false,
  'bibliography [1] Darwin must not receive id="fn-1"'
);
assert.strictEqual(
  typedResult.footnotes.some((f) => f.id === 'fn-1' && /Rubin/.test(f.text)),
  true,
  'footnote metadata must include the stamped typed note'
);

// Same pairing without a notes heading: a trailing [N] paragraph that
// matches an in-text token, before the bibliography.
const trailingHtml =
  '<p>της σκοτεινής ύλης[1] είναι η παρατήρηση.</p>' +
  '<p>[1] Σημείωση για την καμπύλη περιστροφής.</p>' +
  '<h2>Βιβλιογραφία</h2>' +
  '<p>Zwicky, F., 1933. Die Rotverschiebung.</p>';
const trailing = extractFootnotesLikeDocumentProcessor(trailingHtml);
const $trail = cheerio.load(renderFootnoteTokens(trailing.content));
assert.strictEqual($trail('a[id="fnref-1"]').attr('href'), '#fn-1');
assert.strictEqual($trail('#fn-1').length, 1);
assert.match($trail('#fn-1').text(), /καμπύλη περιστροφής/);

console.log('footnote scheme asserts passed');
