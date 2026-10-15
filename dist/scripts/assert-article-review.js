"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
const ArticleReviewService_1 = require("../services/ArticleReviewService");
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const html = `<p>Hello</p><img src="data:image/png;base64,${png.toString('base64')}" alt="fig">`;
const images = [
    {
        id: 'image-1',
        data: png,
        contentType: 'image/png',
    },
];
const stripped = (0, ArticleReviewService_1.stripImageDataUris)(html, images);
assert_1.default.match(stripped, /src="\[image:image-1\]"/, 'data URI becomes a placeholder');
assert_1.default.doesNotMatch(stripped, /data:image\/png/, 'raw data URI is removed');
const restored = (0, ArticleReviewService_1.restoreImageDataUris)(stripped, images);
assert_1.default.match(restored, /data:image\/png;base64,/, 'placeholder is restored to a data URI');
assert_1.default.ok(restored.includes(png.toString('base64')), 'restored payload matches the original image');
const originalAnthropic = process.env.ANTHROPIC_REVIEW_MODEL;
delete process.env.ANTHROPIC_REVIEW_MODEL;
try {
    const providers = ArticleReviewService_1.articleReviewService.listProviders();
    const anthropic = providers.find((item) => item.id === 'anthropic');
    assert_1.default.ok(anthropic, 'anthropic is listed');
    assert_1.default.strictEqual(anthropic?.defaultModel, 'claude-sonnet-5', 'default model matches the first allowlisted Anthropic id');
    assert_1.default.ok(anthropic?.models.some((item) => item.id === anthropic.defaultModel), 'GET default is one of the dropdown ids');
    assert_1.default.ok(anthropic?.models.some((item) => item.id === 'claude-sonnet-5'), 'claude-sonnet-5 is the primary allowlisted id');
    assert_1.default.ok(anthropic?.models.some((item) => item.id === 'claude-opus-5'), 'claude-opus-5 is allowlisted');
    assert_1.default.ok(anthropic?.models.some((item) => item.id === 'claude-haiku-4-5'), 'claude-haiku-4-5 stays as the faster option');
    assert_1.default.ok(!anthropic?.models.some((item) => item.id === 'claude-sonnet-4-6'), 'retired claude-sonnet-4-6 is not an allowlisted id');
    const selected = ArticleReviewService_1.articleReviewService.resolveSelection('anthropic', 'claude-opus-5');
    assert_1.default.strictEqual(selected.model, 'claude-opus-5', 'requested model is used as-is');
    const emptyRequest = ArticleReviewService_1.articleReviewService.resolveSelection('anthropic', '');
    assert_1.default.strictEqual(emptyRequest.model, 'claude-sonnet-5', 'empty request falls back to the first allowlisted id');
    process.env.ANTHROPIC_REVIEW_MODEL = 'claude-sonnet-4-6';
    const listedWithBadEnv = ArticleReviewService_1.articleReviewService
        .listProviders()
        .find((item) => item.id === 'anthropic');
    assert_1.default.strictEqual(listedWithBadEnv?.defaultModel, 'claude-sonnet-5', 'invalid env must not become the UI default');
    const uiWins = ArticleReviewService_1.articleReviewService.resolveSelection('anthropic', 'claude-sonnet-5');
    assert_1.default.strictEqual(uiWins.model, 'claude-sonnet-5', 'UI selection is not replaced by an env default');
    try {
        ArticleReviewService_1.articleReviewService.resolveSelection('anthropic', '');
        assert_1.default.fail('invalid env with no request model should throw');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert_1.default.match(message, /ANTHROPIC_REVIEW_MODEL/, 'error names the env var');
        assert_1.default.match(message, /claude-sonnet-4-6/, 'error names the invalid value');
        assert_1.default.match(message, /claude-sonnet-5/, 'error lists allowed ids');
    }
    try {
        ArticleReviewService_1.articleReviewService.resolveSelection('anthropic', 'claude-sonnet-4-6');
        assert_1.default.fail('unlisted request model should throw');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        assert_1.default.match(message, /claude-sonnet-4-6/, 'error names the requested id');
        assert_1.default.match(message, /claude-sonnet-5/, 'error lists allowed ids');
    }
    process.env.ANTHROPIC_REVIEW_MODEL = 'claude-haiku-4-5';
    const envFallback = ArticleReviewService_1.articleReviewService.resolveSelection('anthropic', '');
    assert_1.default.strictEqual(envFallback.model, 'claude-haiku-4-5', 'allowlisted env is used only when the request omits a model');
}
finally {
    if (originalAnthropic === undefined) {
        delete process.env.ANTHROPIC_REVIEW_MODEL;
    }
    else {
        process.env.ANTHROPIC_REVIEW_MODEL = originalAnthropic;
    }
}
assert_1.default.strictEqual((0, ArticleReviewService_1.anthropicDefaultsToAdaptiveThinking)('claude-sonnet-5'), true, 'Sonnet 5 thinks by default');
assert_1.default.strictEqual((0, ArticleReviewService_1.anthropicDefaultsToAdaptiveThinking)('claude-opus-5'), true, 'Opus 5 thinks by default');
assert_1.default.strictEqual((0, ArticleReviewService_1.anthropicDefaultsToAdaptiveThinking)('claude-haiku-4-5'), false, 'Haiku 4.5 does not think by default');
const sonnetBody = (0, ArticleReviewService_1.buildAnthropicReviewBody)('claude-sonnet-5', 'review this');
assert_1.default.strictEqual(sonnetBody.max_tokens, 65536, 'Anthropic rewrite budget leaves room for a full article');
assert_1.default.deepStrictEqual(sonnetBody.thinking, { type: 'disabled' }, 'Sonnet 5 must not spend the JSON budget on thinking');
assert_1.default.ok(!('output_config' in sonnetBody), 'constrained JSON decoding is too slow for long articles');
const haikuBody = (0, ArticleReviewService_1.buildAnthropicReviewBody)('claude-haiku-4-5', 'review this');
assert_1.default.ok(!('thinking' in haikuBody), 'older models do not get an unsupported thinking field');
assert_1.default.deepStrictEqual((0, ArticleReviewService_1.parseModelJson)('{"title":"A"}'), { title: 'A' });
assert_1.default.strictEqual((0, ArticleReviewService_1.parseModelJson)('{"title": "truncated"'), null, 'truncated JSON is rejected');
assert_1.default.deepStrictEqual((0, ArticleReviewService_1.parseModelJson)(String.raw `{"content":"$$x \leftrightarrow y$$"}`), { content: String.raw `$$x \leftrightarrow y$$` }, 'unescaped LaTeX backslashes are repaired into valid JSON');
assert_1.default.match((0, ArticleReviewService_1.invalidReviewJsonMessage)(''), /empty review/);
assert_1.default.match((0, ArticleReviewService_1.invalidReviewJsonMessage)('{"title":'), /output limit/);
assert_1.default.match((0, ArticleReviewService_1.invalidReviewJsonMessage)('not json at all'), /valid JSON/);
const prompt = (0, ArticleReviewService_1.reviewPrompt)({
    title: 'Title',
    excerpt: 'Excerpt',
    content: '<p>Hello</p>',
    footnotes: [],
    citations: [],
    images: [],
});
assert_1.default.match(prompt, /empty string/, 'prompt tells the model not to echo unchanged HTML');
const kept = (0, ArticleReviewService_1.applyReviewToArticle)({
    title: 'Title',
    excerpt: 'Excerpt',
    content: '<p>Original</p>',
    footnotes: [],
    citations: [],
    images: [],
}, {
    title: 'Title',
    excerpt: 'Excerpt',
    content: '',
    footnotes: [],
    citations: [],
    images: [],
    changeNotes: ['Left the HTML unchanged'],
    layoutAttention: [],
});
assert_1.default.strictEqual(kept.article.content, '<p>Original</p>', 'empty content keeps the original HTML');
console.log('article review asserts passed');
//# sourceMappingURL=assert-article-review.js.map