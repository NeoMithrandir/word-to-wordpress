import assert from 'assert';
import {
  isGenericAlt,
  isGenericHeading,
  isWeakImageContext,
  looksLikeCaption,
  rewriteImageSeoHtml,
  seoFromContext,
  uniquifyFilenameStem,
} from '../services/ImageSeoService';
import { toLatinSlug } from '../lib/latinSlug';

assert.strictEqual(isGenericAlt(''), true, 'empty alt is generic');
assert.strictEqual(isGenericAlt('Document image'), true, 'Document image is generic');
assert.strictEqual(isGenericAlt('document image'), true, 'document image is generic');
assert.strictEqual(isGenericAlt('IMAGE'), true, 'IMAGE is generic');
assert.strictEqual(isGenericAlt('  picture  '), true, 'picture is generic');
assert.strictEqual(
  isGenericAlt('Διάγραμμα διασποράς ψυχρών ατόμων'),
  false,
  'descriptive Greek alt is kept'
);

assert.strictEqual(isGenericHeading('Εισαγωγή'), true, 'Εισαγωγή is generic');
assert.strictEqual(isGenericHeading('Συμπεράσματα'), true, 'Συμπεράσματα is generic');
assert.strictEqual(isGenericHeading('Introduction'), true, 'Introduction is generic');
assert.strictEqual(isGenericHeading('Conclusions'), true, 'Conclusions is generic');
assert.strictEqual(
  isGenericHeading('Νοητικά πειράματα με ψυχρά άτομα'),
  false,
  'specific heading is kept'
);

assert.ok(looksLikeCaption('Εικόνα 1. Το πείραμα σε παγίδα'), 'Εικόνα prefix is a caption');
assert.ok(looksLikeCaption('Σχήμα 2 — διάγραμμα'), 'Σχήμα prefix is a caption');
assert.ok(looksLikeCaption('Πίνακας 3. Αποτελέσματα'), 'Πίνακας prefix is a caption');
assert.ok(looksLikeCaption('Figure 1. Optical setup'), 'Figure prefix is a caption');
assert.ok(
  looksLikeCaption('Σύντομη λεζάντα δίπλα στην εικόνα', { italic: true }),
  'short italic paragraph is a caption'
);
assert.strictEqual(
  looksLikeCaption(
    'This is a normal body paragraph that continues the argument and should not be treated as a caption even if it mentions an image once.'
  ),
  false,
  'long body paragraph is not a caption'
);

const used = new Set<string>();
const first = uniquifyFilenameStem('Διάγραμμα διασποράς', used);
const second = uniquifyFilenameStem('Διάγραμμα διασποράς', used);
const third = uniquifyFilenameStem('Διάγραμμα διασποράς', used);
assert.strictEqual(first, toLatinSlug('Διάγραμμα διασποράς'));
assert.strictEqual(second, `${first}-2`, 'second identical stem gets -2');
assert.strictEqual(third, `${first}-3`, 'third identical stem gets -3');
assert.notStrictEqual(first, second);
assert.ok(new Set([first, second, third]).size === 3, 'stems stay unique');

const fromAlt = seoFromContext(
  {
    wordAlt: 'Οπτική παγίδα MOT',
    caption: 'Εικόνα 1. Η παγίδα',
    heading: 'Πείραμα',
    articleTitle: 'Άρθρο',
  },
  'image-1'
);
assert.strictEqual(fromAlt.seoSource, 'alt');
assert.strictEqual(fromAlt.alt, 'Οπτική παγίδα MOT');

const fromCaption = seoFromContext(
  {
    wordAlt: 'Document image',
    caption: 'Εικόνα 1. Η παγίδα',
    heading: 'Πείραμα',
    articleTitle: 'Άρθρο',
  },
  'image-1'
);
assert.strictEqual(fromCaption.seoSource, 'caption');
assert.strictEqual(fromCaption.alt, 'Εικόνα 1. Η παγίδα');

const fromHeading = seoFromContext(
  {
    wordAlt: '',
    caption: '',
    heading: 'Πείραμα με ψυχρά άτομα',
    articleTitle: 'Άρθρο',
  },
  'image-1'
);
assert.strictEqual(fromHeading.seoSource, 'heading');
assert.strictEqual(fromHeading.filename, toLatinSlug('Πείραμα με ψυχρά άτομα'));

const fromTitle = seoFromContext(
  {
    wordAlt: 'image',
    caption: '',
    heading: 'Εισαγωγή',
    articleTitle: 'Νοητικά πειράματα',
  },
  'image-1'
);
assert.strictEqual(fromTitle.seoSource, 'title');
assert.notStrictEqual(fromTitle.alt.toLowerCase(), 'document image');
assert.ok(
  isWeakImageContext({
    wordAlt: 'Document image',
    caption: '',
    heading: 'Introduction',
    articleTitle: 'A paper',
  }),
  'generic alt + generic heading is weak'
);
assert.ok(
  !isWeakImageContext({
    wordAlt: '',
    caption: 'Εικόνα 1. Setup',
    heading: '',
    articleTitle: 'A paper',
  }),
  'caption is enough context'
);

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const dataUri = `data:image/png;base64,${png.toString('base64')}`;
const rewritten = rewriteImageSeoHtml(`<p><img src="${dataUri}" alt=""></p>`, [
  {
    id: 'image-1',
    filename: 'optiki-pagida',
    alt: 'Οπτική παγίδα',
    title: 'Οπτική παγίδα',
    caption: 'Εικόνα 1. Η παγίδα',
    contentType: 'image/png',
    data: png,
  },
]);
assert.match(rewritten, /alt="Οπτική παγίδα"/, 'publish rewrite writes img alt');
assert.match(rewritten, /<figure>/, 'caption wraps the image in figure');
assert.match(rewritten, /<figcaption>Εικόνα 1\. Η παγίδα<\/figcaption>/);
assert.ok(rewritten.includes(dataUri), 'rewrite keeps the original data URI for later URL swap');

const withOriginalCaption = rewriteImageSeoHtml(
  `<p><img src="${dataUri}" alt=""></p><p>Εικόνα 1. Η παγίδα</p>`,
  [
    {
      id: 'image-1',
      filename: 'optiki-pagida',
      alt: 'Οπτική παγίδα',
      title: 'Οπτική παγίδα',
      caption: 'Εικόνα 1. Η παγίδα',
      contentType: 'image/png',
      data: png,
    },
  ]
);
assert.strictEqual(
  (withOriginalCaption.match(/Εικόνα 1\. Η παγίδα/g) || []).length,
  1,
  'original caption paragraph is not left next to figcaption'
);

const alreadyFigure = rewriteImageSeoHtml(
  `<figure><img src="${dataUri}" alt="old"><figcaption>old cap</figcaption></figure>`,
  [
    {
      id: 'image-1',
      filename: 'optiki-pagida',
      alt: 'Νέο alt',
      title: 'Title',
      caption: 'Νέα λεζάντα',
      contentType: 'image/png',
      data: png,
    },
  ]
);
assert.match(alreadyFigure, /alt="Νέο alt"/);
assert.strictEqual(
  (alreadyFigure.match(/<figure>/g) || []).length,
  1,
  'already-wrapped figure is not wrapped again'
);
assert.match(alreadyFigure, /<figcaption>Νέα λεζάντα<\/figcaption>/);

console.log('image SEO asserts passed');
