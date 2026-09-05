import assert from 'assert';
import { spawnCommandOptions } from '../services/spawnCommand';
import {
  isPublishUiStatus,
  mergeUnlistedCategoryIds,
  resolveWordPressPostStatus
} from '../services/WordPressService';

assert.strictEqual(isPublishUiStatus('unlisted'), true, 'unlisted is a UI status');
assert.strictEqual(isPublishUiStatus('draft'), true, 'draft is a UI status');
assert.strictEqual(isPublishUiStatus('preview'), false, 'unknown status is rejected');

assert.strictEqual(resolveWordPressPostStatus('unlisted'), 'publish', 'unlisted maps to WP publish');
assert.strictEqual(resolveWordPressPostStatus('draft'), 'draft', 'draft stays draft');
assert.strictEqual(resolveWordPressPostStatus('private'), 'private', 'WP-private stays private');
assert.strictEqual(resolveWordPressPostStatus('publish'), 'publish', 'publish stays publish');
assert.strictEqual(resolveWordPressPostStatus('nope'), 'draft', 'unknown falls back to draft');

assert.deepStrictEqual(
  mergeUnlistedCategoryIds(12, 3, [12, 99]),
  [12, 3, 99],
  'subject + private are attached and de-duplicated'
);
assert.deepStrictEqual(
  mergeUnlistedCategoryIds(12, 3),
  [12, 3],
  'subject + private without extras'
);

const spawnOpts = spawnCommandOptions();
assert.strictEqual(spawnOpts.windowsHide, true, 'spawn should hide the Windows console');
assert.strictEqual(
  spawnOpts.shell,
  process.platform === 'win32',
  'Windows spawn of npm.cmd requires shell: true (Node EINVAL / CVE-2024-27980)'
);

console.log('unlisted preview asserts passed');
