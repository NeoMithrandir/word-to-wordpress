import assert from 'assert';
import * as cheerio from 'cheerio';
import {
  buildNumberedBibliography,
  isBibliographyHeading,
  linkBibliographyCitations,
  splitInTextCitations,
} from '../lib/bibliography';

assert.strictEqual(
  buildNumberedBibliography([]),
  '',
  'empty citations should produce an empty string, not "[1] "'
);
assert.strictEqual(
  buildNumberedBibliography(null),
  '',
  'null citations should produce an empty string'
);
assert.strictEqual(
  buildNumberedBibliography(undefined),
  '',
  'undefined citations should produce an empty string'
);

const numbered = buildNumberedBibliography([
  { text: 'Darwin, C. (1859). On the Origin of Species. London: John Murray.' },
  { text: 'Ζαρίμη, Μ. (2025). Τα Χνάρια του Δαρβίνου. ΠΕΚ. https://doi.org/10.1234/example' },
]);
assert.strictEqual(
  numbered,
  '[1] Darwin, C. (1859). On the Origin of Species. London: John Murray.\n' +
    '[2] Ζαρίμη, Μ. (2025). Τα Χνάρια του Δαρβίνου. ΠΕΚ. https://doi.org/10.1234/example',
  'citations should become one numbered "[N] text" line each, in document order'
);

// This is the exact shape InScience-v2's parseBibliography (src/lib/utils.ts)
// expects: a leading [N] marker it strips, then free text with an optional
// inline URL/DOI it extracts for the reference links.
assert.match(numbered.split('\n')[0], /^\[1\] /, 'first line must start with [1] ');
assert.match(numbered.split('\n')[1], /^\[2\] /, 'second line must start with [2] ');

// Blank/whitespace-only entries are skipped, and numbering stays contiguous
// afterwards (no "[2] " gap left behind for a dropped entry).
const withBlank = buildNumberedBibliography([
  { text: 'First entry.' },
  { text: '   ' },
  { text: 'Third entry.' },
]);
assert.strictEqual(
  withBlank,
  '[1] First entry.\n[2] Third entry.',
  'blank citation entries should be skipped without leaving a numbering gap'
);

assert.strictEqual(isBibliographyHeading('Βιβλιογραφία'), true);
assert.strictEqual(isBibliographyHeading('ΒΙΒΛΙΟΓΡΑΦΙΑ'), true);
assert.strictEqual(isBibliographyHeading('Bibliography'), true);
assert.strictEqual(isBibliographyHeading('References:'), true);
assert.strictEqual(
  isBibliographyHeading('ΒΙΒΛΙΟΓΡΑΦΙΑ ΕΛΛΗΝΙΚΗ'),
  true,
  'qualified Greek bibliography headings must count as bibliography'
);
assert.strictEqual(
  isBibliographyHeading('ΒΙΒΛΙΟΓΡΑΦΙΑ ΞΕΝΟΓΛΩΣΣΗ'),
  true,
  'qualified foreign bibliography headings must count as bibliography'
);
assert.strictEqual(isBibliographyHeading('Βιβλιογραφικές αναφορές'), true);
assert.strictEqual(isBibliographyHeading('Αναφορές'), true);
assert.strictEqual(isBibliographyHeading('ΣΗΜΕΙΩΣΕΙΣ'), false);
assert.strictEqual(
  isBibliographyHeading(
    'Βιβλιογραφία για αυτό το θέμα υπάρχει στο πρώτο μέρος της σειράς και σε πολλά άλλα άρθρα.'
  ),
  false,
  'ordinary sentences that mention bibliography must not become headings'
);

// This document's real layout: two qualified h2 sections. The linker used
// to require an exact "Βιβλιογραφία" title and then stop at the next h2,
// so (Drukier et al., 1986) never reached the foreign-language entry.
const twoSectionHtml = `
<p>Το κυρίαρχο μοντέλο (Drukier et al., 1986) που έχει αναδυθεί.</p>
<p>Παλαιότερες μετρήσεις (Bartusiak, 2022) στο πρώτο μέρος.</p>
<h2>ΒΙΒΛΙΟΓΡΑΦΙΑ ΕΛΛΗΝΙΚΗ</h2>
<p>Bartusiak, M., 2022. H Μέρα που ανακαλύψαμε το Σύμπαν, Θεσσαλονίκη: ΡΟΠΗ.</p>
<h2>ΒΙΒΛΙΟΓΡΑΦΙΑ ΞΕΝΟΓΛΩΣΣΗ</h2>
<p>Drukier, A., K., Freese, K., Spergel, D., N., 1986. Detecting cold dark matter candidates. Phys. Rev. D 33, 3495.</p>
`;
const $two = cheerio.load(twoSectionHtml);
const twoCitations = linkBibliographyCitations($two);
assert.ok(
  twoCitations.some((c) => c.id === 'bib-drukier-1986'),
  'foreign-language entries after a second bibliography heading must be parsed'
);
assert.ok(
  twoCitations.some((c) => c.id === 'bib-bartusiak-2022'),
  'Greek-language entries under the first bibliography heading must still be parsed'
);
assert.strictEqual(
  twoCitations.some((c) => /βιβλιογραφ/i.test(c.text)),
  false,
  'bibliography subheads must not be stored as citation entries'
);
assert.strictEqual(
  $two('a[href="#bib-drukier-1986"]').text(),
  '(Drukier et al., 1986)',
  'in-text (Drukier et al., 1986) must link to the foreign bibliography entry'
);
assert.strictEqual(
  $two('a[href="#bib-bartusiak-2022"]').text(),
  '(Bartusiak, 2022)',
  'in-text (Bartusiak, 2022) must link to the Greek bibliography entry'
);
assert.strictEqual($two('#bib-drukier-1986').length, 1);
assert.strictEqual($two('#bib-bartusiak-2022').length, 1);

assert.deepStrictEqual(
  splitInTextCitations('Lundmark, 1930, Zwicky, 1933, Zwicky, 1937').map((c) => ({
    authors: c.authors,
    year: c.year,
  })),
  [
    { authors: 'Lundmark', year: '1930' },
    { authors: 'Zwicky', year: '1933' },
    { authors: 'Zwicky', year: '1937' },
  ],
  'comma-separated author-year clusters must split into one citation per year'
);
assert.deepStrictEqual(
  splitInTextCitations('Cirelli, M., et al., 2025').map((c) => ({
    authors: c.authors,
    year: c.year,
  })),
  [{ authors: 'Cirelli, M., et al.', year: '2025' }],
  'author + initials + et al. + year is a single citation'
);
assert.deepStrictEqual(
  splitInTextCitations('Babcock, 1939; Rubin & Ford, 1970').map((c) => ({
    authors: c.authors,
    year: c.year,
  })),
  [
    { authors: 'Babcock', year: '1939' },
    { authors: 'Rubin & Ford', year: '1970' },
  ],
  'semicolon-separated citations must split on each year'
);

const multiCiteHtml = `
<p>ενδείξεις (Lundmark, 1930, Zwicky, 1933, Zwicky, 1937) για την ύλη.</p>
<p>υποψήφιο σωματίδιο (Cirelli, M., et al., 2025) στο πρότυπο.</p>
<p>ζεύγος (Green &amp; Kavanagh, 2021) και παλιότερα (Babcock, 1939; Rubin &amp; Ford, 1970).</p>
<p>μοντέλο (Drukier et al., 1986) που έχει αναδυθεί.</p>
<h2>Βιβλιογραφία</h2>
<p>Babcock, H., 1939. The rotation of the Andromeda Nebula.</p>
<p>Cirelli, M., et al., 2025. Dark Matter.</p>
<p>Drukier, A., K., Freese, K., Spergel, D., N., 1986. Detecting cold dark matter candidates.</p>
<p>Green, A., Kavanagh, B., 2021. Primordial black holes as a dark matter candidate.</p>
<p>Lundmark, K., 1930. Über die Bestimmung der Entfernungen.</p>
<p>Rubin, V., Ford, K., 1970. Rotation of the Andromeda Nebula.</p>
<p>Zwicky, F., 1933. Die Rotverschiebung von extragalaktischen Nebeln.</p>
<p>Zwicky, F., 1937. On the Masses of Nebulae and of Clusters of Nebulae.</p>
`;
const $multi = cheerio.load(multiCiteHtml);
linkBibliographyCitations($multi);

assert.strictEqual(
  $multi('a[href="#bib-lundmark-1930"]').text(),
  'Lundmark, 1930',
  'Lundmark 1930 must be its own citation anchor'
);
assert.strictEqual(
  $multi('a[href="#bib-zwicky-1933"]').text(),
  'Zwicky, 1933',
  'Zwicky 1933 must be its own citation anchor'
);
assert.strictEqual(
  $multi('a[href="#bib-zwicky-1937"]').text(),
  'Zwicky, 1937',
  'Zwicky 1937 must be its own citation anchor'
);
assert.strictEqual(
  $multi('p').first().find('a[href^="#bib-"]').length,
  3,
  '(Lundmark, 1930, Zwicky, 1933, Zwicky, 1937) must become three separate anchors'
);
assert.match(
  $multi('p').first().html() || '',
  /\(<a href="#bib-lundmark-1930">Lundmark, 1930<\/a>, <a href="#bib-zwicky-1933">Zwicky, 1933<\/a>, <a href="#bib-zwicky-1937">Zwicky, 1937<\/a>\)/,
  'surrounding parentheses and commas must stay around the three anchors'
);
assert.strictEqual(
  $multi('a[href="#bib-cirelli-2025"]').text(),
  '(Cirelli, M., et al., 2025)',
  '(Cirelli, M., et al., 2025) must become a citation link'
);
assert.strictEqual(
  $multi('a[href="#bib-green-2021"]').text(),
  '(Green & Kavanagh, 2021)',
  '(Author & Author, year) must link'
);
assert.strictEqual(
  $multi('a[href="#bib-babcock-1939"]').text(),
  'Babcock, 1939',
  'first half of a semicolon pair must link'
);
assert.strictEqual(
  $multi('a[href="#bib-rubin-1970"]').text(),
  'Rubin & Ford, 1970',
  'second half of a semicolon pair must link'
);
assert.strictEqual(
  $multi('a[href="#bib-drukier-1986"]').text(),
  '(Drukier et al., 1986)',
  '(Author et al., year) must still link as a single citation'
);

console.log('bibliography asserts passed');
