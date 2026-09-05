import * as cheerio from 'cheerio';
import { toLatinSlug } from '../lib/latinSlug';
import { convertToWebp } from './ImageOptimizer';

export type ImageSeoSource = 'alt' | 'caption' | 'heading' | 'title' | 'ai';

export interface ImageSeoContext {
  wordAlt: string;
  caption: string;
  heading: string;
  articleTitle: string;
}

export interface ImageSeoFields {
  filename: string;
  alt: string;
  title: string;
  caption?: string;
  seoSource: ImageSeoSource;
}

/** Image fields ImageSeoService reads and writes. Compatible with ProcessedImage. */
export interface ImageSeoTarget {
  id: string;
  filename: string;
  alt: string;
  title: string;
  caption?: string;
  seoSource?: ImageSeoSource;
  data: Buffer | string | { data: number[] };
  contentType: string;
}

function normalizeLabel(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const GENERIC_ALT_EXACT = new Set(
  [
    'document image',
    'image',
    'picture',
    'photo',
    'graphic',
    'img',
    'untitled',
    'εικόνα',
    'φωτογραφία',
  ].map(normalizeLabel)
);

const GENERIC_HEADINGS = new Set(
  [
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
  ].map(normalizeLabel)
);

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
const AI_TIMEOUT_MS = 20_000;

const VISION_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export function isGenericAlt(alt: string): boolean {
  const normalized = normalizeLabel(alt);
  if (!normalized) return true;
  if (GENERIC_ALT_EXACT.has(normalized)) return true;
  return /^document\s+image\b/.test(normalized);
}

export function isGenericHeading(heading: string): boolean {
  const normalized = normalizeLabel(heading);
  if (!normalized) return true;
  return GENERIC_HEADINGS.has(normalized);
}

export function looksLikeCaption(
  text: string,
  options?: { italic?: boolean }
): boolean {
  const trimmed = (text ?? '').trim();
  if (!trimmed || trimmed.length > MAX_CAPTION_LENGTH) return false;
  const normalized = normalizeLabel(trimmed);
  if (
    CAPTION_PREFIXES.some(
      (prefix) =>
        normalized === prefix ||
        normalized.startsWith(`${prefix} `) ||
        normalized.startsWith(`${prefix}.`) ||
        normalized.startsWith(`${prefix}:`) ||
        normalized.startsWith(`${prefix}-`)
    )
  ) {
    return true;
  }
  if (options?.italic && !trimmed.includes('\n')) return true;
  return false;
}

export function isWeakImageContext(ctx: ImageSeoContext): boolean {
  const hasRealAlt = Boolean(ctx.wordAlt) && !isGenericAlt(ctx.wordAlt);
  const hasCaption = Boolean(ctx.caption);
  const hasUsefulHeading =
    Boolean(ctx.heading) && !isGenericHeading(ctx.heading);
  return !hasRealAlt && !hasCaption && !hasUsefulHeading;
}

export function uniquifyFilenameStem(stem: string, used: Set<string>): string {
  const base = toLatinSlug(stem);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  const unique = `${base}-${n}`;
  used.add(unique);
  return unique;
}

export function imageSeoSourceLabel(source: ImageSeoSource): string {
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
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function seoFromContext(
  ctx: ImageSeoContext,
  fallbackId: string
): ImageSeoFields {
  const wordAlt = ctx.wordAlt.trim();
  const caption = ctx.caption.trim();
  const heading = ctx.heading.trim();
  const articleTitle = ctx.articleTitle.trim();

  if (wordAlt && !isGenericAlt(wordAlt)) {
    return {
      filename: toLatinSlug(wordAlt),
      alt: wordAlt,
      title: caption || heading || wordAlt,
      caption: caption || undefined,
      seoSource: 'alt',
    };
  }

  if (caption) {
    return {
      filename: toLatinSlug(caption),
      alt: caption,
      title: caption,
      caption,
      seoSource: 'caption',
    };
  }

  if (heading && !isGenericHeading(heading)) {
    return {
      filename: toLatinSlug(heading),
      alt: heading,
      title: heading,
      caption: undefined,
      seoSource: 'heading',
    };
  }

  const titleFallback = articleTitle || fallbackId;
  return {
    filename: toLatinSlug(titleFallback),
    alt: articleTitle,
    title: titleFallback,
    caption: undefined,
    seoSource: 'title',
  };
}

function imageDataToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return Buffer.from((data as { data: number[] }).data);
  }
  throw new Error('Invalid image data');
}

function imageDataUri(img: ImageSeoTarget): string {
  const buf = imageDataToBuffer(img.data);
  return `data:${img.contentType};base64,${buf.toString('base64')}`;
}

function removeMatchingCaptionSibling(
  $node: cheerio.Cheerio<any>,
  caption: string
): void {
  const $next = $node.next();
  if ($next.length && $next.text().trim() === caption) {
    $next.remove();
  }
}

/**
 * Set alt on matching data-URI images and wrap them in figure/figcaption
 * when a caption is present and the image is not already in a figure.
 */
export function rewriteImageSeoHtml(
  html: string,
  images: ImageSeoTarget[]
): string {
  if (!html || images.length === 0) return html;

  const $ = cheerio.load(html);
  const byUri = new Map(images.map((img) => [imageDataUri(img), img]));

  $('img').each((_, el) => {
    const $img = $(el);
    const src = $img.attr('src') || '';
    const img = byUri.get(src);
    if (!img) return;

    $img.attr('alt', img.alt || '');
    if (img.title) $img.attr('title', img.title);

    const caption = (img.caption || '').trim();
    if (!caption) return;

    const $existingFigure = $img.closest('figure');
    if ($existingFigure.length) {
      const $cap = $existingFigure.find('figcaption').first();
      if ($cap.length) {
        $cap.text(caption);
      } else {
        $existingFigure.append($('<figcaption>').text(caption));
      }
      return;
    }

    const $figure = $('<figure></figure>');
    const $caption = $('<figcaption>').text(caption);
    const $parent = $img.parent();
    const parentIsImageOnlyParagraph =
      $parent.is('p') &&
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

interface AnthropicSeoResult {
  filenameStem?: string;
  alt?: string;
  title?: string;
  caption?: string;
}

function parseAnthropicJson(text: string): AnthropicSeoResult | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(trimmed) as AnthropicSeoResult;
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as AnthropicSeoResult;
    } catch {
      return null;
    }
  }
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
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

export class ImageSeoService {
  async enrichWeakImages(
    images: ImageSeoTarget[],
    articleTitle: string
  ): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) return;

    const weak = images.filter((img) => img.seoSource === 'title');
    if (weak.length === 0) return;

    const used = new Set(images.map((img) => img.filename));

    await mapPool(weak, AI_CONCURRENCY, async (img) => {
      const result = await this.suggestFromVision(img, articleTitle, apiKey);
      if (!result) return;

      const alt = (result.alt || '').trim();
      const title = (result.title || alt || img.title).trim();
      const caption = (result.caption || '').trim();
      used.delete(img.filename);
      const stem = uniquifyFilenameStem(
        result.filenameStem || title || alt || img.filename,
        used
      );

      img.filename = stem;
      if (alt && !isGenericAlt(alt)) img.alt = alt;
      if (title) img.title = title;
      if (caption) img.caption = caption;
      img.seoSource = 'ai';
    });
  }

  private async suggestFromVision(
    img: ImageSeoTarget,
    articleTitle: string,
    apiKey: string
  ): Promise<AnthropicSeoResult | null> {
    try {
      const input = imageDataToBuffer(img.data);
      const optimized = await convertToWebp(input);
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
        console.warn(
          `Image SEO AI skipped for ${img.id}: Anthropic HTTP ${response.status}`
        );
        return null;
      }

      const body = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const text = body.content?.find((block) => block.type === 'text')?.text || '';
      return parseAnthropicJson(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Image SEO AI skipped for ${img.id}: ${message}`);
      return null;
    }
  }
}

export const imageSeoService = new ImageSeoService();
