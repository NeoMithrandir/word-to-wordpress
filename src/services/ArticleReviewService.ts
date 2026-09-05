import { toLatinSlug } from '../lib/latinSlug';
import { ProcessedContent, ProcessedImage } from './DocumentProcessor';
import { createError } from '../middleware/errorHandler';

export type ReviewProviderId = 'anthropic' | 'openai' | 'gemini';

export interface ReviewModelOption {
  id: string;
  label: string;
}

export interface ReviewProviderOption {
  id: ReviewProviderId;
  label: string;
  configured: boolean;
  models: ReviewModelOption[];
  defaultModel: string;
}

export interface ArticleReviewInput {
  title: string;
  excerpt: string;
  content: string;
  footnotes: ProcessedContent['footnotes'];
  citations: ProcessedContent['citations'];
  images: Array<
    Pick<ProcessedImage, 'id' | 'filename' | 'alt' | 'title' | 'caption'> & {
      data?: ProcessedImage['data'] | string;
      contentType?: string;
    }
  >;
}

export interface ArticleReviewArticle {
  title: string;
  excerpt: string;
  content: string;
  slug: string;
  footnotes: ProcessedContent['footnotes'];
  citations: ProcessedContent['citations'];
  images: Array<{
    id: string;
    filename: string;
    alt: string;
    title: string;
    caption?: string;
  }>;
}

export interface ArticleReviewResult {
  article: ArticleReviewArticle;
  changeNotes: string[];
  layoutAttention: string[];
  provider: ReviewProviderId;
  model: string;
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
/** Outbound provider call. Keep below Express / client so this hop returns the 504. */
const REVIEW_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_OUTPUT_TOKENS = 8192;

const ANTHROPIC_MODELS: ReviewModelOption[] = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];

const OPENAI_MODELS: ReviewModelOption[] = [
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
];

const GEMINI_MODELS: ReviewModelOption[] = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
];

const IMAGE_PLACEHOLDER = /src="data:[^"]+"/gi;

function anthropicKey(): string {
  return process.env.ANTHROPIC_API_KEY?.trim() || '';
}

function openaiKey(): string {
  return process.env.OPENAI_API_KEY?.trim() || '';
}

function geminiKey(): string {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || '';
}

function modelsFor(provider: ReviewProviderId): ReviewModelOption[] {
  switch (provider) {
    case 'anthropic':
      return ANTHROPIC_MODELS;
    case 'openai':
      return OPENAI_MODELS;
    case 'gemini':
      return GEMINI_MODELS;
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function envReviewModelVar(provider: ReviewProviderId): string {
  switch (provider) {
    case 'anthropic':
      return 'ANTHROPIC_REVIEW_MODEL';
    case 'openai':
      return 'OPENAI_REVIEW_MODEL';
    case 'gemini':
      return 'GEMINI_REVIEW_MODEL';
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function envReviewModel(provider: ReviewProviderId): string {
  switch (provider) {
    case 'anthropic':
      return process.env.ANTHROPIC_REVIEW_MODEL?.trim() || '';
    case 'openai':
      return process.env.OPENAI_REVIEW_MODEL?.trim() || '';
    case 'gemini':
      return process.env.GEMINI_REVIEW_MODEL?.trim() || '';
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

function allowlistedIds(provider: ReviewProviderId): string[] {
  return modelsFor(provider).map((item) => item.id);
}

function isAllowlistedModel(provider: ReviewProviderId, model: string): boolean {
  return allowlistedIds(provider).includes(model);
}

function firstAllowlistedModel(provider: ReviewProviderId): string {
  return modelsFor(provider)[0].id;
}

/** Dropdown default: env only if it is an allowlisted id. Never invent unlisted ids. */
function defaultModel(provider: ReviewProviderId): string {
  const fromEnv = envReviewModel(provider);
  if (fromEnv && isAllowlistedModel(provider, fromEnv)) {
    return fromEnv;
  }
  return firstAllowlistedModel(provider);
}

function unknownModelError(
  provider: ReviewProviderId,
  model: string,
  source: 'request' | 'env'
): never {
  const allowed = allowlistedIds(provider).join(', ');
  switch (source) {
    case 'request':
      throw createError(
        `Model "${model}" is not in the ${provider} allowlist. Allowed: ${allowed}.`,
        400
      );
    case 'env':
      throw createError(
        `${envReviewModelVar(provider)} "${model}" is not in the ${provider} allowlist. Allowed: ${allowed}.`,
        400
      );
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function isReviewProviderId(value: unknown): value is ReviewProviderId {
  return value === 'anthropic' || value === 'openai' || value === 'gemini';
}

function parseModelJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

function imageBase64(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('base64');
  return '';
}

/** Replace data-URIs so the model sees layout without multi-megabyte payloads. */
export function stripImageDataUris(
  html: string,
  images: Array<{ id: string; data?: unknown; contentType?: string }>
): string {
  let next = html;
  for (const image of images) {
    const data = imageBase64(image.data);
    if (!data || !image.contentType) continue;
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

export function restoreImageDataUris(
  html: string,
  images: Array<Pick<ProcessedImage, 'id' | 'data' | 'contentType'>>
): string {
  let next = html;
  for (const image of images) {
    const token = `[image:${image.id}]`;
    const data =
      typeof image.data === 'string'
        ? image.data
        : Buffer.isBuffer(image.data)
          ? image.data.toString('base64')
          : '';
    if (!data) continue;
    next = next.split(`src="${token}"`).join(`src="data:${image.contentType};base64,${data}"`);
    next = next.split(token).join(`data:${image.contentType};base64,${data}`);
  }
  return next;
}

function reviewPrompt(input: ArticleReviewInput): string {
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
    'Review the converted article and return a publish-ready version.',
    'Keep the original language (usually Greek). Do not invent facts, citations, or quotes.',
    'Fix conversion artifacts: broken headings, split paragraphs, leftover Word junk, awkward line breaks.',
    'Keep HTML semantic and simple (h2–h4, p, ul/ol, blockquote, em, strong, a, figure/figcaption, img, table).',
    'Do not wrap the article in <html> or <body>. Return only the inner article HTML.',
    'Preserve every [image:ID] src placeholder exactly. Do not drop images.',
    'Image filenames must be Latin/ASCII kebab-case, no extension, no sequential image-N unless there is no better name.',
    'Alt text must describe the figure; captions optional.',
    'Return JSON only with this shape:',
    '{',
    '  "title": "string",',
    '  "excerpt": "string",',
    '  "content": "html string",',
    '  "footnotes": [{ "id": "string", "text": "string", "backRef": "string" }],',
    '  "citations": [{ "id": "string", "text": "string", "source": "string" }],',
    '  "images": [{ "id": "string", "filename": "latin-kebab", "alt": "string", "title": "string", "caption": "string" }],',
    '  "changeNotes": ["what you changed"],',
    '  "layoutAttention": ["layout or typesetting items a human should check"]',
    '}',
    'changeNotes: concrete edits you made.',
    'layoutAttention: figures, tables, equations, footnote markers, or columns that may still look wrong.',
    '',
    'Article JSON:',
    JSON.stringify(payload),
  ].join('\n');
}

function applyReviewToArticle(
  input: ArticleReviewInput,
  parsed: unknown
): { article: ArticleReviewArticle; changeNotes: string[]; layoutAttention: string[] } {
  if (!parsed || typeof parsed !== 'object') {
    throw createError('The model did not return valid JSON.', 502);
  }
  const raw = parsed as Record<string, unknown>;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : input.title;
  const excerpt = typeof raw.excerpt === 'string' ? raw.excerpt.trim() : input.excerpt;
  const content =
    typeof raw.content === 'string' && raw.content.trim() ? raw.content : input.content;

  const footnotes = Array.isArray(raw.footnotes)
    ? raw.footnotes.map((item, index) => {
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
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
        const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
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
      if (!item || typeof item !== 'object') return false;
      return (item as { id?: unknown }).id === img.id;
    }) as Record<string, unknown> | undefined;
    const filenameRaw =
      typeof match?.filename === 'string' && match.filename.trim()
        ? match.filename
        : img.filename || img.id;
    return {
      id: img.id,
      filename: toLatinSlug(filenameRaw),
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
      slug: toLatinSlug(title),
      footnotes,
      citations,
      images,
    },
    changeNotes: asStringArray(raw.changeNotes),
    layoutAttention: asStringArray(raw.layoutAttention),
  };
}

async function callAnthropic(model: string, prompt: string, apiKey: string): Promise<string> {
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
      body: JSON.stringify({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      throw createError(`Anthropic review failed (HTTP ${response.status}).`, 502);
    }
    const body = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    return body.content?.find((block) => block.type === 'text')?.text || '';
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(model: string, prompt: string, apiKey: string): Promise<string> {
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
      throw createError(`OpenAI review failed (HTTP ${response.status}).`, 502);
    }
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(model: string, prompt: string, apiKey: string): Promise<string> {
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
      throw createError(`Gemini review failed (HTTP ${response.status}).`, 502);
    }
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  } finally {
    clearTimeout(timer);
  }
}

async function callProvider(
  provider: ReviewProviderId,
  model: string,
  prompt: string
): Promise<string> {
  switch (provider) {
    case 'anthropic': {
      const key = anthropicKey();
      if (!key) throw createError('ANTHROPIC_API_KEY is not set.', 400);
      return callAnthropic(model, prompt, key);
    }
    case 'openai': {
      const key = openaiKey();
      if (!key) throw createError('OPENAI_API_KEY is not set.', 400);
      return callOpenAI(model, prompt, key);
    }
    case 'gemini': {
      const key = geminiKey();
      if (!key) throw createError('GEMINI_API_KEY (or GOOGLE_API_KEY) is not set.', 400);
      return callGemini(model, prompt, key);
    }
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

export class ArticleReviewService {
  listProviders(): ReviewProviderOption[] {
    const providers: ReviewProviderOption[] = [
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

  resolveSelection(
    providerRaw: unknown,
    modelRaw: unknown
  ): { provider: ReviewProviderId; model: string } {
    if (!isReviewProviderId(providerRaw)) {
      throw createError('Choose a review provider: anthropic, openai, or gemini.', 400);
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

  async review(
    input: ArticleReviewInput,
    provider: ReviewProviderId,
    model: string
  ): Promise<ArticleReviewResult> {
    const prompt = reviewPrompt(input);
    let text: string;
    try {
      text = await callProvider(provider, model, prompt);
    } catch (error) {
      if (error && typeof error === 'object' && 'statusCode' in error) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (/aborted/i.test(message)) {
        throw createError(
          'The LLM review timed out after 5 minutes. Retry, or try another model.',
          504
        );
      }
      throw createError(`LLM review failed: ${message}`, 502);
    }

    const parsed = parseModelJson(text);
    const applied = applyReviewToArticle(input, parsed);
    return {
      ...applied,
      provider,
      model,
    };
  }
}

export const articleReviewService = new ArticleReviewService();
