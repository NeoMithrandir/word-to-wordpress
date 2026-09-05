import { randomUUID } from 'crypto';
import { ProcessedContent, ProcessedImage } from './DocumentProcessor';
import { ImageSeoSource } from './ImageSeoService';
import { restoreImageDataUris } from './ArticleReviewService';

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export interface ImageMetaOverlay {
  id: string;
  filename?: string;
  alt: string;
  title: string;
  caption?: string;
  seoSource?: ImageSeoSource;
  contentType: string;
}

/** Editable fields the client may send back without image binaries. */
export interface ProcessedContentOverlay {
  title?: string;
  excerpt?: string;
  /** Body HTML; data-URIs may be replaced with [image:id] placeholders. */
  content?: string;
  footnotes?: ProcessedContent['footnotes'];
  citations?: ProcessedContent['citations'];
  equations?: ProcessedContent['equations'];
  wordCount?: number;
  images?: ImageMetaOverlay[];
}

type CacheEntry = {
  content: ProcessedContent;
  createdAt: number;
};

const cache = new Map<string, CacheEntry>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [id, entry] of cache) {
    if (now - entry.createdAt > CACHE_TTL_MS) {
      cache.delete(id);
    }
  }
}

export function storeProcessedContent(content: ProcessedContent): string {
  pruneExpired();
  const contentId = randomUUID();
  cache.set(contentId, { content, createdAt: Date.now() });
  return contentId;
}

export function getProcessedContent(contentId: string | undefined): ProcessedContent | undefined {
  if (!contentId) return undefined;
  const entry = cache.get(contentId);
  return entry?.content;
}

function mergeImageMeta(
  cached: ProcessedImage[],
  overlay: ImageMetaOverlay[] | undefined
): ProcessedImage[] {
  if (!overlay || overlay.length === 0) return cached;
  return cached.map((img, index) => {
    const meta = overlay[index];
    if (!meta) return img;
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

export function updateProcessedContent(
  contentId: string,
  overlay: ProcessedContentOverlay
): ProcessedContent | undefined {
  const entry = cache.get(contentId);
  if (!entry) return undefined;
  entry.content = mergeProcessedContent(entry.content, overlay);
  return entry.content;
}

export function mergeProcessedContent(
  cached: ProcessedContent,
  overlay?: ProcessedContentOverlay
): ProcessedContent {
  if (!overlay) return cached;
  return {
    ...cached,
    title: overlay.title ?? cached.title,
    excerpt: overlay.excerpt ?? cached.excerpt,
    content: overlay.content != null
      ? restoreImageDataUris(overlay.content, cached.images)
      : cached.content,
    footnotes: overlay.footnotes ?? cached.footnotes,
    citations: overlay.citations ?? cached.citations,
    equations: overlay.equations ?? cached.equations,
    wordCount: overlay.wordCount ?? cached.wordCount,
    images: mergeImageMeta(cached.images, overlay.images),
  };
}

/** JSON-safe image payloads for the browser preview (base64, not Buffer number arrays). */
export function serializeImagesForClient(images: ProcessedImage[]): Array<
  Omit<ProcessedImage, 'data'> & { data: string }
> {
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
