"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const bibliography_1 = require("../lib/bibliography");
assert_1.default.strictEqual((0, bibliography_1.buildNumberedBibliography)([]), '', 'empty citations should produce an empty string, not "[1] "');
assert_1.default.strictEqual((0, bibliography_1.buildNumberedBibliography)(null), '', 'null citations should produce an empty string');
assert_1.default.strictEqual((0, bibliography_1.buildNumberedBibliography)(undefined), '', 'undefined citations should produce an empty string');
const numbered = (0, bibliography_1.buildNumberedBibliography)([
    { text: 'Darwin, C. (1859). On the Origin of Species. London: John Murray.' },
    { text: 'Ζαρίμη, Μ. (2025). Τα Χνάρια του Δαρβίνου. ΠΕΚ. https://doi.org/10.1234/example' },
]);
assert_1.default.strictEqual(numbered, '[1] Darwin, C. (1859). On the Origin of Species. London: John Murray.\n' +
    '[2] Ζαρίμη, Μ. (2025). Τα Χνάρια του Δαρβίνου. ΠΕΚ. https://doi.org/10.1234/example', 'citations should become one numbered "[N] text" line each, in document order');
// This is the exact shape InScience-v2's parseBibliography (src/lib/utils.ts)
// expects: a leading [N] marker it strips, then free text with an optional
// inline URL/DOI it extracts for the reference links.
assert_1.default.match(numbered.split('\n')[0], /^\[1\] /, 'first line must start with [1] ');
assert_1.default.match(numbered.split('\n')[1], /^\[2\] /, 'second line must start with [2] ');
// Blank/whitespace-only entries are skipped, and numbering stays contiguous
// afterwards (no "[2] " gap left behind for a dropped entry).
const withBlank = (0, bibliography_1.buildNumberedBibliography)([
    { text: 'First entry.' },
    { text: '   ' },
    { text: 'Third entry.' },
]);
assert_1.default.strictEqual(withBlank, '[1] First entry.\n[2] Third entry.', 'blank citation entries should be skipped without leaving a numbering gap');
console.log('bibliography asserts passed');
//# sourceMappingURL=assert-bibliography.js.map