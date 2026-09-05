import assert from 'assert';
import {
  articleReviewService,
  restoreImageDataUris,
  stripImageDataUris,
} from '../services/ArticleReviewService';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const html = `<p>Hello</p><img src="data:image/png;base64,${png.toString('base64')}" alt="fig">`;
const images = [
  {
    id: 'image-1',
    data: png,
    contentType: 'image/png',
  },
];

const stripped = stripImageDataUris(html, images);
assert.match(stripped, /src="\[image:image-1\]"/, 'data URI becomes a placeholder');
assert.doesNotMatch(stripped, /data:image\/png/, 'raw data URI is removed');

const restored = restoreImageDataUris(stripped, images);
assert.match(restored, /data:image\/png;base64,/, 'placeholder is restored to a data URI');
assert.ok(restored.includes(png.toString('base64')), 'restored payload matches the original image');

const originalAnthropic = process.env.ANTHROPIC_REVIEW_MODEL;
delete process.env.ANTHROPIC_REVIEW_MODEL;

try {
  const providers = articleReviewService.listProviders();
  const anthropic = providers.find((item) => item.id === 'anthropic');
  assert.ok(anthropic, 'anthropic is listed');
  assert.strictEqual(
    anthropic?.defaultModel,
    'claude-sonnet-5',
    'default model matches the first allowlisted Anthropic id'
  );
  assert.ok(
    anthropic?.models.some((item) => item.id === anthropic.defaultModel),
    'GET default is one of the dropdown ids'
  );
  assert.ok(
    anthropic?.models.some((item) => item.id === 'claude-sonnet-5'),
    'claude-sonnet-5 is the primary allowlisted id'
  );
  assert.ok(
    anthropic?.models.some((item) => item.id === 'claude-opus-5'),
    'claude-opus-5 is allowlisted'
  );
  assert.ok(
    anthropic?.models.some((item) => item.id === 'claude-haiku-4-5'),
    'claude-haiku-4-5 stays as the faster option'
  );
  assert.ok(
    !anthropic?.models.some((item) => item.id === 'claude-sonnet-4-6'),
    'retired claude-sonnet-4-6 is not an allowlisted id'
  );

  const selected = articleReviewService.resolveSelection('anthropic', 'claude-opus-5');
  assert.strictEqual(selected.model, 'claude-opus-5', 'requested model is used as-is');

  const emptyRequest = articleReviewService.resolveSelection('anthropic', '');
  assert.strictEqual(
    emptyRequest.model,
    'claude-sonnet-5',
    'empty request falls back to the first allowlisted id'
  );

  process.env.ANTHROPIC_REVIEW_MODEL = 'claude-sonnet-4-6';
  const listedWithBadEnv = articleReviewService
    .listProviders()
    .find((item) => item.id === 'anthropic');
  assert.strictEqual(
    listedWithBadEnv?.defaultModel,
    'claude-sonnet-5',
    'invalid env must not become the UI default'
  );

  const uiWins = articleReviewService.resolveSelection('anthropic', 'claude-sonnet-5');
  assert.strictEqual(
    uiWins.model,
    'claude-sonnet-5',
    'UI selection is not replaced by an env default'
  );

  try {
    articleReviewService.resolveSelection('anthropic', '');
    assert.fail('invalid env with no request model should throw');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /ANTHROPIC_REVIEW_MODEL/, 'error names the env var');
    assert.match(message, /claude-sonnet-4-6/, 'error names the invalid value');
    assert.match(message, /claude-sonnet-5/, 'error lists allowed ids');
  }

  try {
    articleReviewService.resolveSelection('anthropic', 'claude-sonnet-4-6');
    assert.fail('unlisted request model should throw');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.match(message, /claude-sonnet-4-6/, 'error names the requested id');
    assert.match(message, /claude-sonnet-5/, 'error lists allowed ids');
  }

  process.env.ANTHROPIC_REVIEW_MODEL = 'claude-haiku-4-5';
  const envFallback = articleReviewService.resolveSelection('anthropic', '');
  assert.strictEqual(
    envFallback.model,
    'claude-haiku-4-5',
    'allowlisted env is used only when the request omits a model'
  );
} finally {
  if (originalAnthropic === undefined) {
    delete process.env.ANTHROPIC_REVIEW_MODEL;
  } else {
    process.env.ANTHROPIC_REVIEW_MODEL = originalAnthropic;
  }
}

console.log('article review asserts passed');
