"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.articleReviewService = exports.ArticleReviewService = void 0;
exports.repairInvalidJsonEscapes = repairInvalidJsonEscapes;
exports.parseModelJson = parseModelJson;
exports.invalidReviewJsonMessage = invalidReviewJsonMessage;
exports.anthropicDefaultsToAdaptiveThinking = anthropicDefaultsToAdaptiveThinking;
exports.buildAnthropicReviewBody = buildAnthropicReviewBody;
exports.stripImageDataUris = stripImageDataUris;
exports.restoreImageDataUris = restoreImageDataUris;
exports.reviewPrompt = reviewPrompt;
exports.applyReviewToArticle = applyReviewToArticle;
const latinSlug_1 = require("../lib/latinSlug");
const errorHandler_1 = require("../middleware/errorHandler");
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
/**
 * Outbound provider abort. Keep below Express / client so this hop returns the 504.
 * A full HTML rewrite can exceed 5 minutes; metadata-only reviews should finish sooner.
 */
const REVIEW_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT_TOKENS = 8192;
/**
 * Sonnet 5 / Opus 5 count thinking + visible text against max_tokens.
 * A full article rewrite as JSON needs far more than the 8k shared cap.
 */
const ANTHROPIC_MAX_OUTPUT_TOKENS = 65536;
const ANTHROPIC_MODELS = [
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { id: 'claude-opus-5', label: 'Claude Opus 5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];
const OPENAI_MODELS = [
    { id: 'gpt-4.1', label: 'GPT-4.1' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
];
const GEMINI_MODELS = [
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];
const IMAGE_PLACEHOLDER = /src="data:[^"]+"/gi;
function anthropicKey() {
    return process.env.ANTHROPIC_API_KEY?.trim() || '';
}
function openaiKey() {
    return process.env.OPENAI_API_KEY?.trim() || '';
}
function geminiKey() {
    return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || '';
}
function modelsFor(provider) {
    switch (provider) {
        case 'anthropic':
            return ANTHROPIC_MODELS;
        case 'openai':
            return OPENAI_MODELS;
        case 'gemini':
            return GEMINI_MODELS;
        default: {
            const _exhaustive = provider;
            return _exhaustive;
        }
    }
}
function envReviewModelVar(provider) {
    switch (provider) {
        case 'anthropic':
            return 'ANTHROPIC_REVIEW_MODEL';
        case 'openai':
            return 'OPENAI_REVIEW_MODEL';
        case 'gemini':
            return 'GEMINI_REVIEW_MODEL';
        default: {
            const _exhaustive = provider;
            return _exhaustive;
        }
    }
}
function envReviewModel(provider) {
    switch (provider) {
        case 'anthropic':
            return process.env.ANTHROPIC_REVIEW_MODEL?.trim() || '';
        case 'openai':
            return process.env.OPENAI_REVIEW_MODEL?.trim() || '';
        case 'gemini':
            return process.env.GEMINI_REVIEW_MODEL?.trim() || '';
        default: {
            const _exhaustive = provider;
            return _exhaustive;
        }
    }
}
function allowlistedIds(provider) {
    return modelsFor(provider).map((item) => item.id);
}
function isAllowlistedModel(provider, model) {
    return allowlistedIds(provider).includes(model);
}
function firstAllowlistedModel(provider) {
    return modelsFor(provider)[0].id;
}
/** Dropdown default: env only if it is an allowlisted id. Never invent unlisted ids. */
function defaultModel(provider) {
    const fromEnv = envReviewModel(provider);
    if (fromEnv && isAllowlistedModel(provider, fromEnv)) {
        return fromEnv;
    }
    return firstAllowlistedModel(provider);
}
function unknownModelError(provider, model, source) {
    const allowed = allowlistedIds(provider).join(', ');
    switch (source) {
        case 'request':
            throw (0, errorHandler_1.createError)(`Model "${model}" is not in the ${provider} allowlist. Allowed: ${allowed}.`, 400);
        case 'env':
            throw (0, errorHandler_1.createError)(`${envReviewModelVar(provider)} "${model}" is not in the ${provider} allowlist. Allowed: ${allowed}.`, 400);
        default: {
            const _exhaustive = source;
            return _exhaustive;
        }
    }
}
function isReviewProviderId(value) {
    return value === 'anthropic' || value === 'openai' || value === 'gemini';
}
/** JSON rejects LaTeX like `\leftrightarrow`; double the unknown backslash. */
function repairInvalidJsonEscapes(text) {
    return text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
}
function parseModelJson(text) {
    const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    const candidates = [trimmed];
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match && match[0] !== trimmed) {
        candidates.push(match[0]);
    }
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        }
        catch {
            try {
                return JSON.parse(repairInvalidJsonEscapes(candidate));
            }
            catch {
                // try the next candidate
            }
        }
    }
    return null;
}
function looksTruncatedJson(text) {
    const trimmed = text.trim();
    if (!trimmed.includes('{'))
        return false;
    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/\}/g) || []).length;
    return opens > closes;
}
function invalidReviewJsonMessage(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        return 'The model returned an empty review. Retry, or try another model.';
    }
    if (looksTruncatedJson(trimmed)) {
        return 'The model hit the output limit before finishing the review JSON. Retry, or try another model.';
    }
    return 'The model did not return valid JSON.';
}
/** Sonnet 5 / Opus 5 think by default; those tokens steal the JSON budget. */
function anthropicDefaultsToAdaptiveThinking(model) {
    return /(?:sonnet|opus)-5(?:-|$)/i.test(model);
}
function buildAnthropicReviewBody(model, prompt) {
    const body = {
        model,
        max_tokens: ANTHROPIC_MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: prompt }],
    };
    if (anthropicDefaultsToAdaptiveThinking(model)) {
        body.thinking = { type: 'disabled' };
    }
    return body;
}
function asStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string' && item.trim() !== '');
}
function imageBase64(data) {
    if (typeof data === 'string')
        return data;
    if (Buffer.isBuffer(data))
        return data.toString('base64');
    return '';
}
/** Replace data-URIs so the model sees layout without multi-megabyte payloads. */
function stripImageDataUris(html, images) {
    let next = html;
    for (const image of images) {
        const data = imageBase64(image.data);
        if (!data || !image.contentType)
            continue;
        const uri = `src="data:${image.contentType};base64,${data}"`;
        next = next.split(uri).join(`src="[image:${image.id}]"`);
    }
    let index = 0;
    return next.replace(IMAGE_PLACEHOLDER, () => {
        const image = images[index];
        index += 1;
        return `src="[image:${image?.id || index}]"`;
    });
}
function restoreImageDataUris(html, images) {
    let next = html;
    for (const image of images) {
        const token = `[image:${image.id}]`;
        const data = typeof image.data === 'string'
            ? image.data
            : Buffer.isBuffer(image.data)
                ? image.data.toString('base64')
                : '';
        if (!data)
            continue;
        next = next.split(`src="${token}"`).join(`src="data:${image.contentType};base64,${data}"`);
        next = next.split(token).join(`data:${image.contentType};base64,${data}`);
    }
    return next;
}
function reviewPrompt(input) {
    const payload = {
        title: input.title,
        excerpt: input.excerpt,
        content: stripImageDataUris(input.content, input.images),
        footnotes: input.footnotes,
        citations: input.citations,
        images: input.images.map((img) => ({
            id: img.id,
            filename: img.filename,
            alt: img.alt,
            title: img.title,
            caption: img.caption || '',
        })),
    };
    return [
        'You are an editor for a science-journalism WordPress site (InScience).',
        'Review the converted article. Return JSON only. Do not wrap the answer in markdown.',
        'Keep the original language (usually Greek). Do not invent facts, citations, or quotes.',
        'Fix conversion artifacts only when they are real: broken headings, split paragraphs, leftover Word junk, awkward line breaks.',
        'Keep HTML semantic and simple (h2–h4, p, ul/ol, blockquote, em, strong, a, figure/figcaption, img, table).',
        'Do not wrap rewritten HTML in <html> or <body>.',
        'Preserve every [image:ID] src placeholder exactly. Do not drop images.',
        'Image filenames must be Latin/ASCII kebab-case, no extension, no sequential image-N unless there is no better name.',
        'Alt text must describe the figure; captions optional.',
        'Do not copy the article HTML into "content" unless you changed it.',
        'If the HTML is already publishable, set "content" to an empty string. The app keeps the original.',
        'Only put rewritten inner HTML in "content" when you fixed conversion artifacts.',
        'Return JSON only with this shape:',
        '{',
        '  "title": "string",',
        '  "excerpt": "string",',
        '  "content": "rewritten html, or empty string to keep the original",',
        '  "footnotes": [{ "id": "string", "text": "string", "backRef": "string" }],',
        '  "citations": [{ "id": "string", "text": "string", "source": "string" }],',
        '  "images": [{ "id": "string", "filename": "latin-kebab", "alt": "string", "title": "string", "caption": "string" }],',
        '  "changeNotes": ["what you changed"],',
        '  "layoutAttention": ["layout or typesetting items a human should check"]',
        '}',
        'changeNotes: concrete edits you made. If you left the HTML unchanged, say so.',
        'layoutAttention: figures, tables, equations, footnote markers, or columns that may still look wrong.',
        '',
        'Article JSON:',
        JSON.stringify(payload),
    ].join('\n');
}
function applyReviewToArticle(input, parsed) {
    if (!parsed || typeof parsed !== 'object') {
        throw (0, errorHandler_1.createError)('The model did not return valid JSON.', 502);
    }
    const raw = parsed;
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : input.title;
    const excerpt = typeof raw.excerpt === 'string' ? raw.excerpt.trim() : input.excerpt;
    const content = typeof raw.content === 'string' && raw.content.trim() ? raw.content : input.content;
    const footnotes = Array.isArray(raw.footnotes)
        ? raw.footnotes.map((item, index) => {
            const row = item && typeof item === 'object' ? item : {};
            const fallback = input.footnotes[index];
            return {
                id: typeof row.id === 'string' && row.id.trim() ? row.id : fallback?.id || `footnote-${index + 1}`,
                text: typeof row.text === 'string' ? row.text : fallback?.text || '',
                backRef: typeof row.backRef === 'string' ? row.backRef : fallback?.backRef || '',
            };
        })
        : input.footnotes;
    const citations = Array.isArray(raw.citations)
        ? raw.citations.map((item, index) => {
            const row = item && typeof item === 'object' ? item : {};
            const fallback = input.citations[index];
            return {
                id: typeof row.id === 'string' && row.id.trim() ? row.id : fallback?.id || `citation-${index + 1}`,
                text: typeof row.text === 'string' ? row.text : fallback?.text || '',
                source: typeof row.source === 'string' ? row.source : fallback?.source || '',
            };
        })
        : input.citations;
    const reviewedImages = Array.isArray(raw.images) ? raw.images : [];
    const images = input.images.map((img) => {
        const match = reviewedImages.find((item) => {
            if (!item || typeof item !== 'object')
                return false;
            return item.id === img.id;
        });
        const filenameRaw = typeof match?.filename === 'string' && match.filename.trim()
            ? match.filename
            : img.filename || img.id;
        return {
            id: img.id,
            filename: (0, latinSlug_1.toLatinSlug)(filenameRaw),
            alt: typeof match?.alt === 'string' ? match.alt : img.alt,
            title: typeof match?.title === 'string' ? match.title : img.title,
            caption: typeof match?.caption === 'string' ? match.caption : img.caption,
        };
    });
    return {
        article: {
            title,
            excerpt,
            content,
            slug: (0, latinSlug_1.toLatinSlug)(title),
            footnotes,
            citations,
            images,
        },
        changeNotes: asStringArray(raw.changeNotes),
        layoutAttention: asStringArray(raw.layoutAttention),
    };
}
function anthropicErrorDetail(payload) {
    if (!payload || typeof payload !== 'object')
        return '';
    const error = payload.error;
    return typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '';
}
function anthropicText(body) {
    return (body.content || [])
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text)
        .join('');
}
async function callAnthropic(model, prompt, apiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
    try {
        const response = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            signal: controller.signal,
            body: JSON.stringify(buildAnthropicReviewBody(model, prompt)),
        });
        const body = (await response.json().catch(() => null));
        if (!response.ok) {
            const detail = anthropicErrorDetail(body);
            throw (0, errorHandler_1.createError)(detail
                ? `Anthropic review failed (HTTP ${response.status}): ${detail}`
                : `Anthropic review failed (HTTP ${response.status}).`, 502);
        }
        if (body?.stop_reason === 'max_tokens') {
            throw (0, errorHandler_1.createError)('The model hit the output limit before finishing the review JSON. Retry, or try another model.', 502);
        }
        if (body?.stop_reason === 'refusal') {
            throw (0, errorHandler_1.createError)('The model refused this review request.', 502);
        }
        return body ? anthropicText(body) : '';
    }
    finally {
        clearTimeout(timer);
    }
}
async function callOpenAI(model, prompt, apiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
    try {
        const response = await fetch(OPENAI_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
            },
            signal: controller.signal,
            body: JSON.stringify({
                model,
                max_tokens: MAX_OUTPUT_TOKENS,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
            }),
        });
        if (!response.ok) {
            throw (0, errorHandler_1.createError)(`OpenAI review failed (HTTP ${response.status}).`, 502);
        }
        const body = (await response.json());
        return body.choices?.[0]?.message?.content || '';
    }
    finally {
        clearTimeout(timer);
    }
}
async function callGemini(model, prompt, apiKey) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    maxOutputTokens: MAX_OUTPUT_TOKENS,
                    responseMimeType: 'application/json',
                },
            }),
        });
        if (!response.ok) {
            throw (0, errorHandler_1.createError)(`Gemini review failed (HTTP ${response.status}).`, 502);
        }
        const body = (await response.json());
        return body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    }
    finally {
        clearTimeout(timer);
    }
}
async function callProvider(provider, model, prompt) {
    switch (provider) {
        case 'anthropic': {
            const key = anthropicKey();
            if (!key)
                throw (0, errorHandler_1.createError)('ANTHROPIC_API_KEY is not set.', 400);
            return callAnthropic(model, prompt, key);
        }
        case 'openai': {
            const key = openaiKey();
            if (!key)
                throw (0, errorHandler_1.createError)('OPENAI_API_KEY is not set.', 400);
            return callOpenAI(model, prompt, key);
        }
        case 'gemini': {
            const key = geminiKey();
            if (!key)
                throw (0, errorHandler_1.createError)('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.', 400);
            return callGemini(model, prompt, key);
        }
        default: {
            const _exhaustive = provider;
            return _exhaustive;
        }
    }
}
class ArticleReviewService {
    listProviders() {
        const providers = [
            {
                id: 'anthropic',
                label: 'Anthropic',
                configured: Boolean(anthropicKey()),
                models: ANTHROPIC_MODELS,
                defaultModel: defaultModel('anthropic'),
            },
            {
                id: 'openai',
                label: 'OpenAI',
                configured: Boolean(openaiKey()),
                models: OPENAI_MODELS,
                defaultModel: defaultModel('openai'),
            },
            {
                id: 'gemini',
                label: 'Google Gemini',
                configured: Boolean(geminiKey()),
                models: GEMINI_MODELS,
                defaultModel: defaultModel('gemini'),
            },
        ];
        return providers;
    }
    resolveSelection(providerRaw, modelRaw) {
        if (!isReviewProviderId(providerRaw)) {
            throw (0, errorHandler_1.createError)('Choose a review provider: anthropic, openai, or gemini.', 400);
        }
        const requested = typeof modelRaw === 'string' ? modelRaw.trim() : '';
        if (requested) {
            if (!isAllowlistedModel(providerRaw, requested)) {
                unknownModelError(providerRaw, requested, 'request');
            }
            return { provider: providerRaw, model: requested };
        }
        const fromEnv = envReviewModel(providerRaw);
        if (fromEnv) {
            if (!isAllowlistedModel(providerRaw, fromEnv)) {
                unknownModelError(providerRaw, fromEnv, 'env');
            }
            return { provider: providerRaw, model: fromEnv };
        }
        return { provider: providerRaw, model: firstAllowlistedModel(providerRaw) };
    }
    async review(input, provider, model) {
        const prompt = reviewPrompt(input);
        console.log(`LLM review start: ${provider}/${model} contentChars=${input.content.length} promptChars=${prompt.length}`);
        let text;
        try {
            text = await callProvider(provider, model, prompt);
        }
        catch (error) {
            if (error && typeof error === 'object' && 'statusCode' in error)
                throw error;
            const message = error instanceof Error ? error.message : String(error);
            if (/aborted/i.test(message)) {
                throw (0, errorHandler_1.createError)('The LLM review timed out after 10 minutes. Retry, or try another model.', 504);
            }
            throw (0, errorHandler_1.createError)(`LLM review failed: ${message}`, 502);
        }
        const parsed = parseModelJson(text);
        if (parsed == null) {
            throw (0, errorHandler_1.createError)(invalidReviewJsonMessage(text), 502);
        }
        const applied = applyReviewToArticle(input, parsed);
        return {
            ...applied,
            provider,
            model,
        };
    }
}
exports.ArticleReviewService = ArticleReviewService;
exports.articleReviewService = new ArticleReviewService();
//# sourceMappingURL=ArticleReviewService.js.map