"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const spawnCommand_1 = require("../services/spawnCommand");
const WordPressService_1 = require("../services/WordPressService");
assert_1.default.strictEqual((0, WordPressService_1.isPublishUiStatus)('unlisted'), true, 'unlisted is a UI status');
assert_1.default.strictEqual((0, WordPressService_1.isPublishUiStatus)('draft'), true, 'draft is a UI status');
assert_1.default.strictEqual((0, WordPressService_1.isPublishUiStatus)('preview'), false, 'unknown status is rejected');
assert_1.default.strictEqual((0, WordPressService_1.resolveWordPressPostStatus)('unlisted'), 'publish', 'unlisted maps to WP publish');
assert_1.default.strictEqual((0, WordPressService_1.resolveWordPressPostStatus)('draft'), 'draft', 'draft stays draft');
assert_1.default.strictEqual((0, WordPressService_1.resolveWordPressPostStatus)('private'), 'private', 'WP-private stays private');
assert_1.default.strictEqual((0, WordPressService_1.resolveWordPressPostStatus)('publish'), 'publish', 'publish stays publish');
assert_1.default.strictEqual((0, WordPressService_1.resolveWordPressPostStatus)('nope'), 'draft', 'unknown falls back to draft');
assert_1.default.deepStrictEqual((0, WordPressService_1.mergeUnlistedCategoryIds)(12, 3, [12, 99]), [12, 3, 99], 'subject + private are attached and de-duplicated');
assert_1.default.deepStrictEqual((0, WordPressService_1.mergeUnlistedCategoryIds)(12, 3), [12, 3], 'subject + private without extras');
const spawnOpts = (0, spawnCommand_1.spawnCommandOptions)();
assert_1.default.strictEqual(spawnOpts.windowsHide, true, 'spawn should hide the Windows console');
assert_1.default.strictEqual(spawnOpts.shell, process.platform === 'win32', 'Windows spawn of npm.cmd requires shell: true (Node EINVAL / CVE-2024-27980)');
console.log('unlisted preview asserts passed');
//# sourceMappingURL=assert-unlisted-preview.js.map