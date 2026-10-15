import { ProcessedContent } from './DocumentProcessor';
export interface WordPressConfig {
    siteUrl: string;
    username: string;
    password: string;
}
export type WordPressPostStatus = 'draft' | 'publish' | 'private';
/** UI / request status. `unlisted` is sent as WP `publish` plus the `private` category. */
export type PublishUiStatus = WordPressPostStatus | 'unlisted';
export declare const PRIVATE_CATEGORY_SLUG = "private";
export declare const PRIVATE_CATEGORY_NAME = "Private";
export interface WordPressCategory {
    id: number;
    name: string;
    slug: string;
    description: string;
    parent: number;
}
export interface WordPressAuthor {
    id: number;
    name: string;
    slug: string;
}
/** Content format understood by the InScience-v2 ACF `article_content_type` field. */
export type ArticleContentType = 'article' | 'video' | 'podcast' | 'book_review' | 'film';
/**
 * ACF fields for the InScience-v2 `group_inscience_article` field group
 * (see arthra's wp-config/acf-fields.php). All optional — publishPost only
 * writes the keys the caller actually supplied (plus the auto-derived
 * bibliography), so a post never ships a half-filled ACF group.
 */
export interface ArticleAcfInput {
    /** 50–100 word summary. Falls back to `content.excerpt` when omitted. */
    abstract?: string;
    contentType?: ArticleContentType;
    youtubeUrl?: string;
    podcastUrl?: string;
    /** Pin to the homepage hero (ACF `article_featured`). */
    featuredArticle?: boolean;
    faq?: Array<{
        question: string;
        answer: string;
    }>;
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
    /** Raw WP media id — only useful when the image already exists on the target site. */
    featuredImage?: number;
    /**
     * Which `ProcessedImage.id` (from the same document) should become the
     * featured image. Resolved to a real WP media id after upload, since
     * embedded images are only uploaded during `publishPost`, not before.
     */
    featuredImageId?: string;
    author?: number;
    /** InScience-v2 ACF article fields. */
    acf?: ArticleAcfInput;
}
export declare function isPublishUiStatus(status: unknown): status is PublishUiStatus;
export declare function resolveWordPressPostStatus(status: unknown): WordPressPostStatus;
export declare function mergeUnlistedCategoryIds(subjectCategoryId: number, privateCategoryId: number, existing?: number[]): number[];
/**
 * Resolve the WP media id for `featured_media`.
 *
 * Preferred path: `postData.featuredImageId` names one of the document's
 * own `ProcessedImage`s (picked in the publish UI before any WP media id
 * exists) — look it up in this publish's own upload results. Falls back
 * to a raw `postData.featuredImage` WP media id for callers that already
 * know it (e.g. reusing an attachment from a previous publish).
 */
export declare function resolveFeaturedMediaId(postData: PostData, uploadedMedia: readonly {
    imageId: string;
    mediaId: number;
}[]): number | undefined;
/**
 * Build the ACF payload for `group_inscience_article` (arthra's
 * wp-config/acf-fields.php). Only ever includes keys we actually have
 * data for, plus `article_content_type` (always set — ACF's own
 * `default_value` only applies inside the wp-admin edit form, not to
 * REST-created posts) and the auto-derived bibliography.
 */
export declare function buildArticleAcfPayload(postData: PostData, content: {
    excerpt: string;
    citations: readonly {
        text: string;
    }[];
}): Record<string, unknown>;
export interface WordPressPost {
    id: number;
    slug?: string;
    title: {
        rendered: string;
    };
    content: {
        rendered: string;
    };
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
    title: {
        raw?: string;
        rendered: string;
    };
    content: {
        raw?: string;
        rendered: string;
        protected: boolean;
    };
    excerpt: {
        raw?: string;
        rendered: string;
        protected: boolean;
    };
    author: number | {
        id: number;
        name: string;
        slug: string;
        avatar_urls?: Record<string, string>;
    };
    featured_media: number;
    featured_image: {
        id: number;
        source_url: string;
        alt_text: string;
        media_details?: {
            width: number;
            height: number;
            file: string;
            sizes?: Record<string, {
                source_url: string;
                width: number;
                height: number;
            }>;
        };
    } | null;
    categories: {
        id: number;
        name: string;
        slug: string;
        description: string;
        parent: number;
    }[];
    tags: {
        id: number;
        name: string;
        slug: string;
        description: string;
    }[];
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
export declare class WordPressService {
    private apiClient;
    /**
     * Initialize WordPress API client.
     * Matches the working curl pattern: Basic auth + Content-Type: application/json + JSON body.
     */
    private initializeClient;
    /**
     * Test WordPress connection
     */
    testConnection(config: WordPressConfig): Promise<boolean>;
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
    publishPost(content: ProcessedContent, config: WordPressConfig, postData: PostData): Promise<WordPressPost>;
    /**
     * POST /posts, retrying with a numeric suffix if WordPress rejects a duplicate slug.
     * Most sites uniquify automatically; this only runs when the API returns a slug conflict.
     */
    private createPostWithUniqueSlug;
    /**
     * Convert each ProcessedImage to WebP (max 1200px on the longer side,
     * smaller images kept at native size) and upload to /media as multipart.
     *
     * Returns one entry per successful upload. Failed conversions/uploads
     * are logged and skipped — the publish continues so the post is not
     * lost; the offending data-URI simply stays in the HTML.
     */
    private uploadImagesAsWebp;
    /**
     * Walk the HTML and replace every embedded `data:<mime>;base64,<payload>`
     * URI for a given image with the corresponding uploaded WP media URL.
     *
     * Matching is by ProcessedImage.id → upload result, with the original
     * base64 string reconstructed from the image's raw bytes (same approach
     * LocalSaveService uses to rewrite for HTML export).
     */
    private replaceDataUrisWithUploadedUrls;
    /**
     * Best-effort: PATCH each uploaded attachment so its `post` field points
     * at the freshly created post. Failure here is non-fatal.
     */
    private attachMediaToPost;
    /**
     * Get WordPress categories
     */
    getCategories(config: WordPressConfig, slug?: string): Promise<WordPressCategory[]>;
    /**
     * GET category by slug; create it if missing.
     */
    ensureCategory(config: WordPressConfig, slug: string, name: string): Promise<WordPressCategory>;
    private normalizeCategories;
    /**
     * Unlisted preview: WP `publish` plus the `private` flag category and a subject category.
     * Other statuses keep any caller-supplied category IDs.
     */
    private resolvePublishCategoryIds;
    /**
     * Get WordPress users for the author picker. Uses the default (view)
     * REST context — id/name/slug are public fields, no elevated capability
     * needed beyond the Application Password's own authentication.
     */
    getAuthors(config: WordPressConfig): Promise<WordPressAuthor[]>;
    private normalizeAuthors;
    /**
     * Get WordPress tags
     */
    getTags(config: WordPressConfig): Promise<any[]>;
    /**
     * Create a new category
     */
    createCategory(config: WordPressConfig, name: string, description?: string, slug?: string): Promise<WordPressCategory>;
    /**
     * Create a new tag
     */
    createTag(config: WordPressConfig, name: string, description?: string): Promise<any>;
    /**
     * Fetch a single page of posts with embedded taxonomy/media data.
     * Uses `_embed` so categories, tags, featured media, and author are
     * resolved inline rather than requiring separate lookups.
     */
    fetchPosts(config: WordPressConfig, options?: FetchPostsOptions): Promise<FetchPostsResult>;
    /**
     * Fetch ALL posts matching the given filters, handling pagination automatically.
     * Calls `onProgress` after each page so the caller can report progress.
     */
    fetchAllPosts(config: WordPressConfig, options: Omit<FetchPostsOptions, 'page' | 'perPage'>, onProgress?: (fetched: number, total: number) => void): Promise<{
        posts: FetchedPost[];
        total: number;
    }>;
    /**
     * Transform a raw WP REST response (with _embed) into our clean FetchedPost shape.
     */
    private normalizeEmbeddedPost;
}
//# sourceMappingURL=WordPressService.d.ts.map