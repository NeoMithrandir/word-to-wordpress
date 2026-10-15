"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const ImageSeoService_1 = require("../services/ImageSeoService");
const latinSlug_1 = require("../lib/latinSlug");
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericAlt)(''), true, 'empty alt is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericAlt)('Document image'), true, 'Document image is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericAlt)('document image'), true, 'document image is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericAlt)('IMAGE'), true, 'IMAGE is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericAlt)('  picture  '), true, 'picture is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericAlt)('Διάγραμμα διασποράς ψυχρών ατόμων'), false, 'descriptive Greek alt is kept');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericHeading)('Εισαγωγή'), true, 'Εισαγωγή is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericHeading)('Συμπεράσματα'), true, 'Συμπεράσματα is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericHeading)('Introduction'), true, 'Introduction is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericHeading)('Conclusions'), true, 'Conclusions is generic');
assert_1.default.strictEqual((0, ImageSeoService_1.isGenericHeading)('Νοητικά πειράματα με ψυχρά άτομα'), false, 'specific heading is kept');
assert_1.default.ok((0, ImageSeoService_1.looksLikeCaption)('Εικόνα 1. Το πείραμα σε παγίδα'), 'Εικόνα prefix is a caption');
assert_1.default.ok((0, ImageSeoService_1.looksLikeCaption)('Σχήμα 2 — διάγραμμα'), 'Σχήμα prefix is a caption');
assert_1.default.ok((0, ImageSeoService_1.looksLikeCaption)('Πίνακας 3. Αποτελέσματα'), 'Πίνακας prefix is a caption');
assert_1.default.ok((0, ImageSeoService_1.looksLikeCaption)('Figure 1. Optical setup'), 'Figure prefix is a caption');
assert_1.default.ok((0, ImageSeoService_1.looksLikeCaption)('Σύντομη λεζάντα δίπλα στην εικόνα', { italic: true }), 'short italic paragraph is a caption');
assert_1.default.strictEqual((0, ImageSeoService_1.looksLikeCaption)('This is a normal body paragraph that continues the argument and should not be treated as a caption even if it mentions an image once.'), false, 'long body paragraph is not a caption');
const used = new Set();
const first = (0, ImageSeoService_1.uniquifyFilenameStem)('Διάγραμμα διασποράς', used);
const second = (0, ImageSeoService_1.uniquifyFilenameStem)('Διάγραμμα διασποράς', used);
const third = (0, ImageSeoService_1.uniquifyFilenameStem)('Διάγραμμα διασποράς', used);
assert_1.default.strictEqual(first, (0, latinSlug_1.toLatinSlug)('Διάγραμμα διασποράς'));
assert_1.default.strictEqual(second, `${first}-2`, 'second identical stem gets -2');
assert_1.default.strictEqual(third, `${first}-3`, 'third identical stem gets -3');
assert_1.default.notStrictEqual(first, second);
assert_1.default.ok(new Set([first, second, third]).size === 3, 'stems stay unique');
const fromAlt = (0, ImageSeoService_1.seoFromContext)({
    wordAlt: 'Οπτική παγίδα MOT',
    caption: 'Εικόνα 1. Η παγίδα',
    heading: 'Πείραμα',
    articleTitle: 'Άρθρο',
}, 'image-1');
assert_1.default.strictEqual(fromAlt.seoSource, 'alt');
assert_1.default.strictEqual(fromAlt.alt, 'Οπτική παγίδα MOT');
const fromCaption = (0, ImageSeoService_1.seoFromContext)({
    wordAlt: 'Document image',
    caption: 'Εικόνα 1. Η παγίδα',
    heading: 'Πείραμα',
    articleTitle: 'Άρθρο',
}, 'image-1');
assert_1.default.strictEqual(fromCaption.seoSource, 'caption');
assert_1.default.strictEqual(fromCaption.alt, 'Εικόνα 1. Η παγίδα');
const fromHeading = (0, ImageSeoService_1.seoFromContext)({
    wordAlt: '',
    caption: '',
    heading: 'Πείραμα με ψυχρά άτομα',
    articleTitle: 'Άρθρο',
}, 'image-1');
assert_1.default.strictEqual(fromHeading.seoSource, 'heading');
assert_1.default.strictEqual(fromHeading.filename, (0, latinSlug_1.toLatinSlug)('Πείραμα με ψυχρά άτομα'));
const fromTitle = (0, ImageSeoService_1.seoFromContext)({
    wordAlt: 'image',
    caption: '',
    heading: 'Εισαγωγή',
    articleTitle: 'Νοητικά πειράματα',
}, 'image-1');
assert_1.default.strictEqual(fromTitle.seoSource, 'title');
assert_1.default.notStrictEqual(fromTitle.alt.toLowerCase(), 'document image');
assert_1.default.ok((0, ImageSeoService_1.isWeakImageContext)({
    wordAlt: 'Document image',
    caption: '',
    heading: 'Introduction',
    articleTitle: 'A paper',
}), 'generic alt + generic heading is weak');
assert_1.default.ok(!(0, ImageSeoService_1.isWeakImageContext)({
    wordAlt: '',
    caption: 'Εικόνα 1. Setup',
    heading: '',
    articleTitle: 'A paper',
}), 'caption is enough context');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const dataUri = `data:image/png;base64,${png.toString('base64')}`;
const rewritten = (0, ImageSeoService_1.rewriteImageSeoHtml)(`<p><img src="${dataUri}" alt=""></p>`, [
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
assert_1.default.match(rewritten, /alt="Οπτική παγίδα"/, 'publish rewrite writes img alt');
assert_1.default.match(rewritten, /<figure>/, 'caption wraps the image in figure');
assert_1.default.match(rewritten, /<figcaption>Εικόνα 1\. Η παγίδα<\/figcaption>/);
assert_1.default.ok(rewritten.includes(dataUri), 'rewrite keeps the original data URI for later URL swap');
const withOriginalCaption = (0, ImageSeoService_1.rewriteImageSeoHtml)(`<p><img src="${dataUri}" alt=""></p><p>Εικόνα 1. Η παγίδα</p>`, [
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
assert_1.default.strictEqual((withOriginalCaption.match(/Εικόνα 1\. Η παγίδα/g) || []).length, 1, 'original caption paragraph is not left next to figcaption');
const alreadyFigure = (0, ImageSeoService_1.rewriteImageSeoHtml)(`<figure><img src="${dataUri}" alt="old"><figcaption>old cap</figcaption></figure>`, [
    {
        id: 'image-1',
        filename: 'optiki-pagida',
        alt: 'Νέο alt',
        title: 'Title',
        caption: 'Νέα λεζάντα',
        contentType: 'image/png',
        data: png,
    },
]);
assert_1.default.match(alreadyFigure, /alt="Νέο alt"/);
assert_1.default.strictEqual((alreadyFigure.match(/<figure>/g) || []).length, 1, 'already-wrapped figure is not wrapped again');
assert_1.default.match(alreadyFigure, /<figcaption>Νέα λεζάντα<\/figcaption>/);
console.log('image SEO asserts passed');
//# sourceMappingURL=assert-image-seo.js.map