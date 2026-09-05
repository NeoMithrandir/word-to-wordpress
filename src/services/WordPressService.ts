import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import { toLatinSlug } from '../lib/latinSlug';
import { ProcessedContent, ProcessedImage } from './DocumentProcessor';
import { convertToWebp } from './ImageOptimizer';
import { rewriteImageSeoHtml, uniquifyFilenameStem } from './ImageSeoService';

function imageDataToBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
    return Buffer.from((data as { data: number[] }).data);
  }
  throw new Error('Invalid image data');
}

export interface WordPressConfig {
  siteUrl: string;
  username: string;
  password: string; // Application password
}

export type WordPressPostStatus = 'draft' | 'publish' | 'private';

/** UI / request status. `unlisted` is sent as WP `publish` plus the `private` category. */
export type PublishUiStatus = WordPressPostStatus | 'unlisted';

export const PRIVATE_CATEGORY_SLUG = 'private';
export const PRIVATE_CATEGORY_NAME = 'Private';

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  parent: number;
}

export interface PostData {
  title?: string;
  /** ASCII slug for new posts only. Updates must not send this unless the user overrode it. */
  slug?: string;
  status: PublishUiStatus;
  /** Required for `unlisted`: the public subject category (φυσική, etc.). */
  subjectCategoryId?: number;
  categories?: number[];
  tags?: number[];
  excerpt?: string;
  featuredImage?: number;
  author?: number;
}

function resolveNewPostSlug(postData: PostData, content: ProcessedContent): string {
  return toLatinSlug(postData.slug || postData.title || content.title);
}

function isWordPressSlugConflict(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const data = error.response?.data as {
    code?: string;
    message?: string;
    data?: { params?: { slug?: unknown } };
  } | undefined;
  if (data?.code === 'rest_invalid_param' && data.data?.params?.slug != null) {
    return true;
  }
  const message = `${data?.message ?? ''} ${data?.code ?? ''}`.toLowerCase();
  return (
    message.includes('slug') &&
    (message.includes('exist') ||
      message.includes('unique') ||
      message.includes('duplicate') ||
      message.includes('already'))
  );
}

export function isPublishUiStatus(status: unknown): status is PublishUiStatus {
  switch (status) {
    case 'draft':
    case 'publish':
    case 'private':
    case 'unlisted':
      return true;
    default:
      return false;
  }
}

export function resolveWordPressPostStatus(status: unknown): WordPressPostStatus {
  if (!isPublishUiStatus(status)) {
    return 'draft';
  }
  switch (status) {
    case 'draft':
    case 'publish':
    case 'private':
      return status;
    case 'unlisted':
      return 'publish';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function mergeUnlistedCategoryIds(
  subjectCategoryId: number,
  privateCategoryId: number,
  existing?: number[]
): number[] {
  const ids = [subjectCategoryId, privateCategoryId, ...(existing ?? [])];
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

export interface WordPressPost {
  id: number;
  slug?: string;
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  status: string;
  date: string;
  modified: string;
}

export interface FetchPostsOptions {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  perPage?: number;
  page?: number;
}

export interface FetchedPost {
  id: number;
  date: string;
  date_gmt: string;
  modified: string;
  modified_gmt: string;
  slug: string;
  status: string;
  type: string;
  link: string;
  title: { raw?: string; rendered: string };
  content: { raw?: string; rendered: string; protected: boolean };
  excerpt: { raw?: string; rendered: string; protected: boolean };
  author: number | { id: number; name: string; slug: string; avatar_urls?: Record<string, string> };
  featured_media: number;
  featured_image: {
    id: number;
    source_url: string;
    alt_text: string;
    media_details?: {
      width: number;
      height: number;
      file: string;
      sizes?: Record<string, { source_url: string; width: number; height: number }>;
    };
  } | null;
  categories: { id: number; name: string; slug: string; description: string; parent: number }[];
  tags: { id: number; name: string; slug: string; description: string }[];
  format: string;
  meta: Record<string, unknown>;
  sticky: boolean;
  template: string;
  comment_status: string;
  ping_status: string;
}

export interface FetchPostsResult {
  posts: FetchedPost[];
  total: number;
  totalPages: number;
  page: number;
}

export class WordPressService {
  private apiClient: AxiosInstance | null = null;

  /**
   * Initialize WordPress API client.
   * Matches the working curl pattern: Basic auth + Content-Type: application/json + JSON body.
   */
  private initializeClient(config: WordPressConfig): AxiosInstance {
    const baseURL = `${config.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`;

    return axios.create({
      baseURL,
      auth: {
        username: config.username,
        password: config.password
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000
    });
  }

  /**
   * Test WordPress connection
   */
  async testConnection(config: WordPressConfig): Promise<boolean> {
    try {
      const client = this.initializeClient(config);
      
      // Test with a simple GET request to posts endpoint
      const response = await client.get('/posts', {
        params: {
          per_page: 1,
          status: 'any'
        }
      });
      
      return response.status === 200;
    } catch (error) {
      console.error('WordPress connection test failed:', error);
      return false;
    }
  }

  /**
   * Publish content to WordPress.
   *
   * Image handling:
   *   1. Each `ProcessedImage` is converted to WebP (resized so the longer
   *      side ≤ 1200 px, smaller images kept at native size).
   *   2. The WebP bytes are uploaded to /wp-json/wp/v2/media (multipart),
   *      yielding a real WordPress attachment URL + media ID.
   *   3. The corresponding base64 data-URI inside `content.content` is
   *      replaced with the uploaded attachment URL *before* the post is
   *      created — so the post body never carries multi-megabyte payloads.
   */
  async publishPost(
    content: ProcessedContent,
    config: WordPressConfig,
    postData: PostData
  ): Promise<WordPressPost> {
    try {
      console.log('Starting publishPost with config:', config.siteUrl);
      const client = this.initializeClient(config);

      // Upload embedded images first, then rewrite their data-URIs in the HTML.
      // We do this BEFORE creating the post so the post body has no base64.
      let postContent = content.content;
      const uploadedMedia: { imageId: string; mediaId: number; sourceUrl: string }[] = [];

      if (content.images && content.images.length > 0) {
        postContent = rewriteImageSeoHtml(postContent, content.images);
        const results = await this.uploadImagesAsWebp(content.images, client);
        uploadedMedia.push(...results);
        postContent = this.replaceDataUrisWithUploadedUrls(
          postContent,
          content.images,
          results
        );
      }
      console.log('Post content prepared, length:', postContent.length);

      // Prepare post data. Omit author unless explicitly set so the post is created
      // as the authenticated user (avoids "not allowed to create posts as this user").
      const baseSlug = resolveNewPostSlug(postData, content);
      const categories = await this.resolvePublishCategoryIds(config, postData);
      const postPayload: Record<string, unknown> = {
        title: postData.title || content.title,
        slug: baseSlug,
        content: postContent,
        excerpt: postData.excerpt || content.excerpt,
        status: resolveWordPressPostStatus(postData.status),
        categories,
        tags: postData.tags || [],
        featured_media: postData.featuredImage,
        meta: {
          footnotes: JSON.stringify(content.footnotes),
          citations: JSON.stringify(content.citations),
          word_count: content.wordCount
        }
      };
      if (postData.author != null && postData.author > 0) {
        postPayload.author = postData.author;
      }

      console.log('Sending post to WordPress API...');
      console.log('Post title:', postPayload.title);
      console.log('Post slug:', postPayload.slug);
      console.log('Post status:', postPayload.status);

      // Create the post. WordPress usually uniquifies colliding slugs itself;
      // retry with -2, -3, … if a host or plugin rejects the duplicate instead.
      const response = await this.createPostWithUniqueSlug(client, postPayload, baseSlug);

      console.log('Post created successfully:', response.data.id);
      console.log('Post URL:', response.data.link);

      // Best-effort: associate uploaded media with the new post so they show
      // up in the post's media list. Failure here doesn't fail the publish.
      if (uploadedMedia.length > 0) {
        await this.attachMediaToPost(uploadedMedia, response.data.id, client);
      }

      return response.data;
    } catch (error) {
      console.error('Error publishing post - Full details:', error);

      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { code?: string; message?: string } | undefined;
        const code = data?.code ?? 'unknown';
        const message = data?.message || error.message;
        const status = error.response?.status;
        console.error('WordPress API error:', { code, message, status });
        console.error('Full response data:', JSON.stringify(error.response?.data, null, 2));
        throw new Error(`WordPress API Error: ${message}`);
      }

      throw new Error(`Failed to publish post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * POST /posts, retrying with a numeric suffix if WordPress rejects a duplicate slug.
   * Most sites uniquify automatically; this only runs when the API returns a slug conflict.
   */
  private async createPostWithUniqueSlug(
    client: AxiosInstance,
    postPayload: Record<string, unknown>,
    baseSlug: string
  ) {
    const maxAttempts = 20;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
      try {
        return await client.post('/posts', { ...postPayload, slug });
      } catch (error) {
        lastError = error;
        if (!isWordPressSlugConflict(error)) {
          throw error;
        }
        console.warn(`Slug "${slug}" was rejected as a duplicate; retrying…`);
      }
    }

    throw lastError;
  }

  /**
   * Convert each ProcessedImage to WebP (max 1200px on the longer side,
   * smaller images kept at native size) and upload to /media as multipart.
   *
   * Returns one entry per successful upload. Failed conversions/uploads
   * are logged and skipped — the publish continues so the post is not
   * lost; the offending data-URI simply stays in the HTML.
   */
  private async uploadImagesAsWebp(
    images: ProcessedImage[],
    client: AxiosInstance
  ): Promise<{ imageId: string; mediaId: number; sourceUrl: string }[]> {
    const results: { imageId: string; mediaId: number; sourceUrl: string }[] = [];
    const usedStems = new Set<string>();

    for (const img of images) {
      try {
        const inputBuf = imageDataToBuffer(img.data);

        const optimized = await convertToWebp(inputBuf);
        const stem = uniquifyFilenameStem(img.filename || img.id, usedStems);
        const filename = `${stem}.${optimized.extension}`;

        const form = new FormData();
        form.append('file', optimized.buffer, {
          filename,
          contentType: optimized.contentType,
        });
        if (img.alt) form.append('alt_text', img.alt);
        if (img.title) form.append('title', img.title);
        if (img.caption) form.append('caption', img.caption);

        const mediaRes = await client.post('/media', form, {
          headers: form.getHeaders(),
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        });

        const mediaId: number | undefined = mediaRes.data?.id;
        const sourceUrl: string | undefined = mediaRes.data?.source_url;
        if (!mediaId || !sourceUrl) {
          console.warn(`  Media upload returned no id/source_url for ${img.id}`);
          continue;
        }

        console.log(
          `  Uploaded ${img.id} → ${filename} (${optimized.width}x${optimized.height}, ${optimized.buffer.length} bytes) — media ID ${mediaId}`
        );
        results.push({ imageId: img.id, mediaId, sourceUrl });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`  Failed to upload image ${img.id}: ${message}`);
      }
    }

    return results;
  }

  /**
   * Walk the HTML and replace every embedded `data:<mime>;base64,<payload>`
   * URI for a given image with the corresponding uploaded WP media URL.
   *
   * Matching is by ProcessedImage.id → upload result, with the original
   * base64 string reconstructed from the image's raw bytes (same approach
   * LocalSaveService uses to rewrite for HTML export).
   */
  private replaceDataUrisWithUploadedUrls(
    html: string,
    images: ProcessedImage[],
    uploads: { imageId: string; mediaId: number; sourceUrl: string }[]
  ): string {
    if (uploads.length === 0) return html;

    const urlByImageId = new Map(uploads.map((u) => [u.imageId, u.sourceUrl]));
    let result = html;

    for (const img of images) {
      const newUrl = urlByImageId.get(img.id);
      if (!newUrl) continue;

      const buf = imageDataToBuffer(img.data);
      const dataUri = `data:${img.contentType};base64,${buf.toString('base64')}`;

      result = result.split(dataUri).join(newUrl);
    }

    return result;
  }

  /**
   * Best-effort: PATCH each uploaded attachment so its `post` field points
   * at the freshly created post. Failure here is non-fatal.
   */
  private async attachMediaToPost(
    uploads: { imageId: string; mediaId: number; sourceUrl: string }[],
    postId: number,
    client: AxiosInstance
  ): Promise<void> {
    for (const u of uploads) {
      try {
        await client.post(`/media/${u.mediaId}`, { post: postId });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`  Could not attach media ${u.mediaId} to post ${postId}: ${message}`);
      }
    }
  }

  /**
   * Get WordPress categories
   */
  async getCategories(config: WordPressConfig, slug?: string): Promise<WordPressCategory[]> {
    try {
      const client = this.initializeClient(config);
      const response = await client.get('/categories', {
        params: {
          per_page: 100,
          ...(slug ? { slug } : {})
        }
      });

      return this.normalizeCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  /**
   * GET category by slug; create it if missing.
   */
  async ensureCategory(
    config: WordPressConfig,
    slug: string,
    name: string
  ): Promise<WordPressCategory> {
    const existing = await this.getCategories(config, slug);
    if (existing[0]) return existing[0];

    try {
      return await this.createCategory(config, name, '', slug);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const data = error.response?.data as { code?: string; data?: { term_id?: number } } | undefined;
        if (data?.code === 'term_exists' && data.data?.term_id) {
          return {
            id: data.data.term_id,
            name,
            slug,
            description: '',
            parent: 0
          };
        }
      }
      const retry = await this.getCategories(config, slug);
      if (retry[0]) return retry[0];
      throw error;
    }
  }

  private normalizeCategories(raw: unknown): WordPressCategory[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const row = item as { id?: unknown; name?: unknown; slug?: unknown; description?: unknown; parent?: unknown };
        const id = typeof row.id === 'number' ? row.id : Number(row.id);
        if (!Number.isInteger(id) || id <= 0) return null;
        return {
          id,
          name: typeof row.name === 'string' ? row.name : '',
          slug: typeof row.slug === 'string' ? row.slug : '',
          description: typeof row.description === 'string' ? row.description : '',
          parent: typeof row.parent === 'number' ? row.parent : 0
        };
      })
      .filter((item): item is WordPressCategory => item != null);
  }

  /**
   * Unlisted preview: WP `publish` plus the `private` flag category and a subject category.
   * Other statuses keep any caller-supplied category IDs.
   */
  private async resolvePublishCategoryIds(
    config: WordPressConfig,
    postData: PostData
  ): Promise<number[]> {
    switch (postData.status) {
      case 'unlisted': {
        if (!postData.subjectCategoryId || postData.subjectCategoryId <= 0) {
          throw new Error('Unlisted preview requires a subject category');
        }
        const privateCategory = await this.ensureCategory(
          config,
          PRIVATE_CATEGORY_SLUG,
          PRIVATE_CATEGORY_NAME
        );
        return mergeUnlistedCategoryIds(
          postData.subjectCategoryId,
          privateCategory.id,
          postData.categories
        );
      }
      case 'draft':
      case 'publish':
      case 'private':
        return postData.categories || [];
      default: {
        const _exhaustive: never = postData.status;
        return _exhaustive;
      }
    }
  }

  /**
   * Get WordPress tags
   */
  async getTags(config: WordPressConfig): Promise<any[]> {
    try {
      const client = this.initializeClient(config);
      const response = await client.get('/tags', {
        params: {
          per_page: 100
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching tags:', error);
      return [];
    }
  }

  /**
   * Create a new category
   */
  async createCategory(
    config: WordPressConfig,
    name: string,
    description?: string,
    slug?: string
  ): Promise<WordPressCategory> {
    try {
      const client = this.initializeClient(config);
      const payload: Record<string, unknown> = {
        name,
        description: description || ''
      };
      if (slug) payload.slug = slug;

      const response = await client.post('/categories', payload);
      const created = this.normalizeCategories([response.data])[0];
      if (!created) {
        throw new Error('WordPress created a category without an id');
      }
      return created;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  /**
   * Create a new tag
   */
  async createTag(config: WordPressConfig, name: string, description?: string): Promise<any> {
    try {
      const client = this.initializeClient(config);
      const response = await client.post('/tags', {
        name,
        description: description || ''
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating tag:', error);
      throw error;
    }
  }

  /**
   * Fetch a single page of posts with embedded taxonomy/media data.
   * Uses `_embed` so categories, tags, featured media, and author are
   * resolved inline rather than requiring separate lookups.
   */
  async fetchPosts(
    config: WordPressConfig,
    options: FetchPostsOptions = {}
  ): Promise<FetchPostsResult> {
    const client = this.initializeClient(config);

    const params: Record<string, unknown> = {
      _embed: 1,
      per_page: Math.min(options.perPage || 100, 100),
      page: options.page || 1,
      status: options.status || 'any',
      orderby: 'date',
      order: 'desc',
    };

    if (options.dateFrom) params.after = new Date(options.dateFrom).toISOString();
    if (options.dateTo) {
      const to = new Date(options.dateTo);
      to.setHours(23, 59, 59, 999);
      params.before = to.toISOString();
    }

    try {
      const response = await client.get('/posts', { params, timeout: 60000 });

      const total = parseInt(response.headers['x-wp-total'] || '0', 10);
      const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);

      const posts: FetchedPost[] = (response.data as any[]).map((raw) =>
        this.normalizeEmbeddedPost(raw)
      );

      return { posts, total, totalPages, page: params.page as number };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const msg = (error.response?.data as any)?.message || error.message;
        throw new Error(`WordPress API Error: ${msg}`);
      }
      throw new Error(`Failed to fetch posts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch ALL posts matching the given filters, handling pagination automatically.
   * Calls `onProgress` after each page so the caller can report progress.
   */
  async fetchAllPosts(
    config: WordPressConfig,
    options: Omit<FetchPostsOptions, 'page' | 'perPage'>,
    onProgress?: (fetched: number, total: number) => void
  ): Promise<{ posts: FetchedPost[]; total: number }> {
    const allPosts: FetchedPost[] = [];
    let page = 1;
    let totalPages = 1;
    let total = 0;

    while (page <= totalPages) {
      const result = await this.fetchPosts(config, {
        ...options,
        perPage: 100,
        page,
      });

      allPosts.push(...result.posts);
      total = result.total;
      totalPages = result.totalPages;

      if (onProgress) onProgress(allPosts.length, total);

      page++;
    }

    return { posts: allPosts, total };
  }

  /**
   * Transform a raw WP REST response (with _embed) into our clean FetchedPost shape.
   */
  private normalizeEmbeddedPost(raw: any): FetchedPost {
    const embedded = raw._embedded || {};

    // Author — first entry in wp:author
    let author: FetchedPost['author'] = raw.author;
    if (embedded['author']?.[0]) {
      const a = embedded['author'][0];
      author = { id: a.id, name: a.name, slug: a.slug, avatar_urls: a.avatar_urls };
    }

    // Featured image — first entry in wp:featuredmedia
    let featured_image: FetchedPost['featured_image'] = null;
    if (embedded['wp:featuredmedia']?.[0] && !embedded['wp:featuredmedia'][0].code) {
      const m = embedded['wp:featuredmedia'][0];
      featured_image = {
        id: m.id,
        source_url: m.source_url,
        alt_text: m.alt_text || '',
        media_details: m.media_details
          ? { width: m.media_details.width, height: m.media_details.height, file: m.media_details.file, sizes: m.media_details.sizes }
          : undefined,
      };
    }

    // Categories & tags from wp:term (array of arrays: [categories[], tags[], ...])
    const termGroups: any[][] = embedded['wp:term'] || [];
    const categories = (termGroups[0] || [])
      .filter((t: any) => t.taxonomy === 'category')
      .map((t: any) => ({ id: t.id, name: t.name, slug: t.slug, description: t.description || '', parent: t.parent || 0 }));
    const tags = (termGroups[1] || [])
      .filter((t: any) => t.taxonomy === 'post_tag')
      .map((t: any) => ({ id: t.id, name: t.name, slug: t.slug, description: t.description || '' }));

    return {
      id: raw.id,
      date: raw.date,
      date_gmt: raw.date_gmt,
      modified: raw.modified,
      modified_gmt: raw.modified_gmt,
      slug: raw.slug,
      status: raw.status,
      type: raw.type,
      link: raw.link,
      title: { raw: raw.title?.raw, rendered: raw.title?.rendered },
      content: { raw: raw.content?.raw, rendered: raw.content?.rendered, protected: raw.content?.protected ?? false },
      excerpt: { raw: raw.excerpt?.raw, rendered: raw.excerpt?.rendered, protected: raw.excerpt?.protected ?? false },
      author,
      featured_media: raw.featured_media,
      featured_image,
      categories,
      tags,
      format: raw.format || 'standard',
      meta: raw.meta || {},
      sticky: raw.sticky ?? false,
      template: raw.template || '',
      comment_status: raw.comment_status || 'closed',
      ping_status: raw.ping_status || 'closed',
    };
  }
} 