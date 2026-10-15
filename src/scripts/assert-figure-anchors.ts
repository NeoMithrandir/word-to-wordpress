import assert from 'assert';
import * as cheerio from 'cheerio';
import {
  figureIdFromCaption,
  linkFigureReferences,
} from '../lib/figureAnchors';

assert.strictEqual(figureIdFromCaption('Εικόνα 1. Halo structure'), 'fig-1');
assert.strictEqual(figureIdFromCaption('Εικ. 2: Rotation curve'), 'fig-2');
assert.strictEqual(figureIdFromCaption('Σχήμα 3 — διάγραμμα'), 'fig-3');
assert.strictEqual(figureIdFromCaption('Figure 4. Optical setup'), 'fig-4');
assert.strictEqual(figureIdFromCaption('Fig. 5'), 'fig-5');
assert.strictEqual(figureIdFromCaption('A normal paragraph about Εικ. 1'), null);

const html = `
<p>Η δομή φαίνεται καθαρά (βλ. Εικ. 1) και στις καμπύλες (βλ. Εικ. 2).</p>
<p>Χωρίς αντιστοιχία: Εικ. 9.</p>
<p><img src="data:image/png;base64,aaa" alt=""></p>
<p>Εικόνα 1. Δομή της άλω του Γαλαξία.</p>
<p><img src="data:image/png;base64,bbb" alt=""></p>
<p>Εικόνα 2: (Πάνω) Μετρήσεις ταχύτητας.</p>
`;
const $ = cheerio.load(html);
linkFigureReferences($);

assert.strictEqual($('#fig-1').length, 1, 'first figure must receive id="fig-1"');
assert.strictEqual($('#fig-2').length, 1, 'second figure must receive id="fig-2"');
assert.ok($('#fig-1').find('img').length, 'fig-1 must sit on the image, not only the caption');
assert.ok($('#fig-2').find('img').length, 'fig-2 must sit on the image, not only the caption');

assert.strictEqual(
  $('a[href="#fig-1"]').text(),
  'Εικ. 1',
  'in-text Εικ. 1 must link to the matching figure'
);
assert.strictEqual(
  $('a[href="#fig-2"]').text(),
  'Εικ. 2',
  'in-text Εικ. 2 must link to the matching figure'
);
assert.strictEqual(
  $('a[href="#fig-9"]').length,
  0,
  'Εικ. 9 must stay plain when no caption uses that number'
);
assert.doesNotMatch(
  $('p').filter((_, el) => $(el).text().startsWith('Εικόνα 1')).html() || '',
  /<a href="#fig-1">/,
  'the caption itself must not become a self-link'
);

console.log('figure-anchor asserts passed');
