"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeProcessedContent = storeProcessedContent;
exports.getProcessedContent = getProcessedContent;
exports.updateProcessedContent = updateProcessedContent;
exports.mergeProcessedContent = mergeProcessedContent;
exports.serializeImagesForClient = serializeImagesForClient;
const crypto_1 = require("crypto");
const ArticleReviewService_1 = require("./ArticleReviewService");
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const cache = new Map();
function pruneExpired() {
    const now = Date.now();
    for (const [id, entry] of cache) {
        if (now - entry.createdAt > CACHE_TTL_MS) {
            cache.delete(id);
        }
    }
}
function storeProcessedContent(content) {
    pruneExpired();
    const contentId = (0, crypto_1.randomUUID)();
    cache.set(contentId, { content, createdAt: Date.now() });
    return contentId;
}
function getProcessedContent(contentId) {
    if (!contentId)
        return undefined;
    const entry = cache.get(contentId);
    return entry?.content;
}
function mergeImageMeta(cached, overlay) {
    if (!overlay || overlay.length === 0)
        return cached;
    return cached.map((img, index) => {
        const meta = overlay[index];
        if (!meta)
            return img;
        return {
            ...img,
            id: meta.id || img.id,
            filename: meta.filename || img.filename || img.id,
            alt: meta.alt ?? img.alt,
            title: meta.title ?? img.title,
            caption: meta.caption ?? img.caption,
            seoSource: meta.seoSource ?? img.seoSource,
        };
    });
}
function updateProcessedContent(contentId, overlay) {
    const entry = cache.get(contentId);
    if (!entry)
        return undefined;
    entry.content = mergeProcessedContent(entry.content, overlay);
    return entry.content;
}
function mergeProcessedContent(cached, overlay) {
    if (!overlay)
        return cached;
    return {
        ...cached,
        title: overlay.title ?? cached.title,
        excerpt: overlay.excerpt ?? cached.excerpt,
        content: overlay.content != null
            ? (0, ArticleReviewService_1.restoreImageDataUris)(overlay.content, cached.images)
            : cached.content,
        footnotes: overlay.footnotes ?? cached.footnotes,
        citations: overlay.citations ?? cached.citations,
        equations: overlay.equations ?? cached.equations,
        wordCount: overlay.wordCount ?? cached.wordCount,
        images: mergeImageMeta(cached.images, overlay.images),
    };
}
/** JSON-safe image payloads for the browser preview (base64, not Buffer number arrays). */
function serializeImagesForClient(images) {
    return images.map((img) => ({
        id: img.id,
        filename: img.filename || img.id,
        alt: img.alt,
        title: img.title,
        caption: img.caption,
        seoSource: img.seoSource,
        contentType: img.contentType,
        data: img.data.toString('base64'),
    }));
}
//# sourceMappingURL=ProcessedContentCache.js.map