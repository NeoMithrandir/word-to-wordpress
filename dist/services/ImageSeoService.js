"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageSeoService = exports.ImageSeoService = void 0;
exports.isGenericAlt = isGenericAlt;
exports.isGenericHeading = isGenericHeading;
exports.looksLikeCaption = looksLikeCaption;
exports.isWeakImageContext = isWeakImageContext;
exports.uniquifyFilenameStem = uniquifyFilenameStem;
exports.imageSeoSourceLabel = imageSeoSourceLabel;
exports.seoFromContext = seoFromContext;
exports.rewriteImageSeoHtml = rewriteImageSeoHtml;
const cheerio = __importStar(require("cheerio"));
const latinSlug_1 = require("../lib/latinSlug");
const ImageOptimizer_1 = require("./ImageOptimizer");
function normalizeLabel(value) {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}
const GENERIC_ALT_EXACT = new Set([
    'document image',
    'image',
    'picture',
    'photo',
    'graphic',
    'img',
    'untitled',
    'εικόνα',
    'φωτογραφία',
].map(normalizeLabel));
const GENERIC_HEADINGS = new Set([
    'εισαγωγή',
    'συμπεράσματα',
    'σύνοψη',
    'περίληψη',
    'πρόλογος',
    'introduction',
    'intro',
    'conclusion',
    'conclusions',
    'abstract',
    'summary',
    'preface',
].map(normalizeLabel));
const CAPTION_PREFIXES = [
    'εικονα',
    'σχημα',
    'πινακας',
    'figure',
    'fig',
    'table',
    'image',
    'caption',
];
const MAX_CAPTION_LENGTH = 220;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_VISION_MODEL = 'claude-sonnet-4-6';
const AI_CONCURRENCY = 2;
const AI_TIMEOUT_MS = 20000;
const VISION_MEDIA_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
]);
function isGenericAlt(alt) {
    const normalized = normalizeLabel(alt);
    if (!normalized)
        return true;
    if (GENERIC_ALT_EXACT.has(normalized))
        return true;
    return /^document\s+image\b/.test(normalized);
}
function isGenericHeading(heading) {
    const normalized = normalizeLabel(heading);
    if (!normalized)
        return true;
    return GENERIC_HEADINGS.has(normalized);
}
function looksLikeCaption(text, options) {
    const trimmed = (text ?? '').trim();
    if (!trimmed || trimmed.length > MAX_CAPTION_LENGTH)
        return false;
    const normalized = normalizeLabel(trimmed);
    if (CAPTION_PREFIXES.some((prefix) => normalized === prefix ||
        normalized.startsWith(`${prefix} `) ||
        normalized.startsWith(`${prefix}.`) ||
        normalized.startsWith(`${prefix}:`) ||
        normalized.startsWith(`${prefix}-`))) {
        return true;
    }
    if (options?.italic && !trimmed.includes('\n'))
        return true;
    return false;
}
function isWeakImageContext(ctx) {
    const hasRealAlt = Boolean(ctx.wordAlt) && !isGenericAlt(ctx.wordAlt);
    const hasCaption = Boolean(ctx.caption);
    const hasUsefulHeading = Boolean(ctx.heading) && !isGenericHeading(ctx.heading);
    return !hasRealAlt && !hasCaption && !hasUsefulHeading;
}
function uniquifyFilenameStem(stem, used) {
    const base = (0, latinSlug_1.toLatinSlug)(stem);
    if (!used.has(base)) {
        used.add(base);
        return base;
    }
    let n = 2;
    while (used.has(`${base}-${n}`))
        n += 1;
    const unique = `${base}-${n}`;
    used.add(unique);
    return unique;
}
function imageSeoSourceLabel(source) {
    switch (source) {
        case 'alt':
            return 'from Word alt';
        case 'caption':
            return 'from caption';
        case 'heading':
            return 'from heading';
        case 'title':
            return 'from article title';
        case 'ai':
            return 'from AI';
        default: {
            const _exhaustive = source;
            return _exhaustive;
        }
    }
}
function seoFromContext(ctx, fallbackId) {
    const wordAlt = ctx.wordAlt.trim();
    const caption = ctx.caption.trim();
    const heading = ctx.heading.trim();
    const articleTitle = ctx.articleTitle.trim();
    if (wordAlt && !isGenericAlt(wordAlt)) {
        return {
            filename: (0, latinSlug_1.toLatinSlug)(wordAlt),
            alt: wordAlt,
            title: caption || heading || wordAlt,
            caption: caption || undefined,
            seoSource: 'alt',
        };
    }
    if (caption) {
        return {
            filename: (0, latinSlug_1.toLatinSlug)(caption),
            alt: caption,
            title: caption,
            caption,
            seoSource: 'caption',
        };
    }
    if (heading && !isGenericHeading(heading)) {
        return {
            filename: (0, latinSlug_1.toLatinSlug)(heading),
            alt: heading,
            title: heading,
            caption: undefined,
            seoSource: 'heading',
        };
    }
    const titleFallback = articleTitle || fallbackId;
    return {
        filename: (0, latinSlug_1.toLatinSlug)(titleFallback),
        alt: articleTitle,
        title: titleFallback,
        caption: undefined,
        seoSource: 'title',
    };
}
function imageDataToBuffer(data) {
    if (Buffer.isBuffer(data))
        return data;
    if (typeof data === 'string')
        return Buffer.from(data, 'base64');
    if (data && typeof data === 'object' && Array.isArray(data.data)) {
        return Buffer.from(data.data);
    }
    throw new Error('Invalid image data');
}
function imageDataUri(img) {
    const buf = imageDataToBuffer(img.data);
    return `data:${img.contentType};base64,${buf.toString('base64')}`;
}
function removeMatchingCaptionSibling($node, caption) {
    const $next = $node.next();
    if ($next.length && $next.text().trim() === caption) {
        $next.remove();
    }
}
/**
 * Set alt on matching data-URI images and wrap them in figure/figcaption
 * when a caption is present and the image is not already in a figure.
 */
function rewriteImageSeoHtml(html, images) {
    if (!html || images.length === 0)
        return html;
    const $ = cheerio.load(html);
    const byUri = new Map(images.map((img) => [imageDataUri(img), img]));
    $('img').each((_, el) => {
        const $img = $(el);
        const src = $img.attr('src') || '';
        const img = byUri.get(src);
        if (!img)
            return;
        $img.attr('alt', img.alt || '');
        if (img.title)
            $img.attr('title', img.title);
        const caption = (img.caption || '').trim();
        if (!caption)
            return;
        const $existingFigure = $img.closest('figure');
        if ($existingFigure.length) {
            const $cap = $existingFigure.find('figcaption').first();
            if ($cap.length) {
                $cap.text(caption);
            }
            else {
                $existingFigure.append($('<figcaption>').text(caption));
            }
            return;
        }
        const $figure = $('<figure></figure>');
        const $caption = $('<figcaption>').text(caption);
        const $parent = $img.parent();
        const parentIsImageOnlyParagraph = $parent.is('p') &&
            $parent.contents().length === 1 &&
            $parent.children('img').length === 1;
        if (parentIsImageOnlyParagraph) {
            $figure.append($img.clone());
            $figure.append($caption);
            $parent.replaceWith($figure);
            removeMatchingCaptionSibling($figure, caption);
            return;
        }
        $img.wrap($figure);
        $img.after($caption);
        removeMatchingCaptionSibling($img.parent(), caption);
    });
    return $('body').html() || html;
}
function parseAnthropicJson(text) {
    const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    try {
        return JSON.parse(trimmed);
    }
    catch {
        const match = trimmed.match(/\{[\s\S]*\}/);
        if (!match)
            return null;
        try {
            return JSON.parse(match[0]);
        }
        catch {
            return null;
        }
    }
}
async function mapPool(items, limit, fn) {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next;
            next += 1;
            await fn(items[index]);
        }
    });
    await Promise.all(workers);
}
class ImageSeoService {
    async enrichWeakImages(images, articleTitle) {
        const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
        if (!apiKey)
            return;
        const weak = images.filter((img) => img.seoSource === 'title');
        if (weak.length === 0)
            return;
        const used = new Set(images.map((img) => img.filename));
        await mapPool(weak, AI_CONCURRENCY, async (img) => {
            const result = await this.suggestFromVision(img, articleTitle, apiKey);
            if (!result)
                return;
            const alt = (result.alt || '').trim();
            const title = (result.title || alt || img.title).trim();
            const caption = (result.caption || '').trim();
            used.delete(img.filename);
            const stem = uniquifyFilenameStem(result.filenameStem || title || alt || img.filename, used);
            img.filename = stem;
            if (alt && !isGenericAlt(alt))
                img.alt = alt;
            if (title)
                img.title = title;
            if (caption)
                img.caption = caption;
            img.seoSource = 'ai';
        });
    }
    async suggestFromVision(img, articleTitle, apiKey) {
        try {
            const input = imageDataToBuffer(img.data);
            const optimized = await (0, ImageOptimizer_1.convertToWebp)(input);
            const mediaType = VISION_MEDIA_TYPES.has(optimized.contentType)
                ? optimized.contentType
                : 'image/webp';
            const model = process.env.ANTHROPIC_IMAGE_SEO_MODEL?.trim() || DEFAULT_VISION_MODEL;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
            const prompt = [
                'You write SEO metadata for a science-article image.',
                `Article title: ${articleTitle || '(untitled)'}`,
                img.title ? `Nearby heading or fallback title: ${img.title}` : '',
                'Return JSON only: { "filenameStem": "latin-kebab", "alt": "...", "title": "...", "caption": "..." }.',
                'filenameStem must be ASCII kebab-case, no extension, no spaces.',
                'alt and title in Greek if the article is Greek, otherwise match the article language.',
                'alt must describe what is visible. Never use "Document image" or generic words like "image".',
                'caption is optional; omit or use empty string if nothing caption-like is appropriate.',
            ]
                .filter(Boolean)
                .join('\n');
            const response = await fetch(ANTHROPIC_URL, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    max_tokens: 400,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: mediaType,
                                        data: optimized.buffer.toString('base64'),
                                    },
                                },
                                { type: 'text', text: prompt },
                            ],
                        },
                    ],
                }),
            });
            clearTimeout(timer);
            if (!response.ok) {
                console.warn(`Image SEO AI skipped for ${img.id}: Anthropic HTTP ${response.status}`);
                return null;
            }
            const body = (await response.json());
            const text = body.content?.find((block) => block.type === 'text')?.text || '';
            return parseAnthropicJson(text);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`Image SEO AI skipped for ${img.id}: ${message}`);
            return null;
        }
    }
}
exports.ImageSeoService = ImageSeoService;
exports.imageSeoService = new ImageSeoService();
//# sourceMappingURL=ImageSeoService.js.map