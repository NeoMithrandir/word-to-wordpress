export interface WordPressImportConfig {
    siteUrl: string;
    username: string;
    password: string;
}
export interface ImportOptions {
    /** Directory containing post-*.json from process-wp-posts */
    processedPostsDir: string;
    /** If true, only log what would be done */
    dryRun?: boolean;
    /** Delay between posts (ms) to avoid overloading the server */
    delayMs?: number;
    /** Skip downloading/uploading featured images */
    skipFeaturedImage?: boolean;
    /**
     * When true (typical for a DB/media clone of production), use `featured_media` /
     * `featured_image.id` from the JSON if that attachment still exists on the target
     * (GET /media/{id}). Avoids duplicate uploads and keeps IDs aligned with in-content URLs.
     * If the ID is missing on the target, falls back to uploading from `featured_image.source_url`.
     */
    reuseFeaturedMediaFromSite?: boolean;
}
/** How the featured image was resolved for a post */
export type FeaturedMediaOutcome = "none" | "skipped_by_flag" | "reused_attachment_id" | "uploaded_from_source_url" | "upload_failed_no_fallback" | "dry_run";
export interface ImportResultEntry {
    file: string;
    slug: string;
    outcome: "success" | "failed";
    wordPressPostId?: number;
    postLink?: string;
    featuredMedia: FeaturedMediaOutcome;
    sourceAttachmentId?: number;
    error?: string;
}
export interface ImportSummary {
    totalFiles: number;
    created: number;
    /** Successful dry-run passes (no POST) */
    dryRunSimulated: number;
    failed: number;
    errors: Array<{
        file: string;
        message: string;
    }>;
    /** One row per processed file (success and failure) */
    results: ImportResultEntry[];
    /** Absolute path of the JSON report written for this run, if saved */
    reportPath?: string;
}
interface ProcessedPost {
    id: number;
    slug: string;
    status: string;
    type: string;
    date: string;
    date_gmt?: string;
    modified?: string;
    modified_gmt?: string;
    title: {
        rendered: string;
    };
    content: {
        rendered: string;
        protected?: boolean;
    };
    excerpt: {
        rendered: string;
        protected?: boolean;
    };
    author?: {
        id: number;
        slug: string;
        name: string;
    };
    featured_media?: number;
    featured_image?: {
        id: number;
        source_url: string;
        alt_text?: string;
        media_details?: {
            file?: string;
        };
    } | null;
    categories: Array<{
        id: number;
        slug: string;
        name: string;
        description?: string;
        parent?: number;
    }>;
    tags: Array<{
        id: number;
        slug: string;
        name: string;
    }>;
    sticky?: boolean;
    format?: string;
    template?: string;
    comment_status?: string;
    ping_status?: string;
    meta?: Record<string, unknown>;
}
export declare class ProcessedPostsImporter {
    private readonly config;
    private client;
    constructor(config: WordPressImportConfig);
    private sleep;
    private filenameFromUrl;
    private guessMime;
    /** GET category by slug; create if missing */
    ensureCategory(slug: string, name: string, dryRun: boolean): Promise<number>;
    /** GET tag by slug; create if missing */
    ensureTag(slug: string, name: string, dryRun: boolean): Promise<number>;
    /** Download image from URL and upload to media library */
    uploadMediaFromUrl(imageUrl: string, altText: string, dryRun: boolean): Promise<number | null>;
    /** True if an attachment with this ID exists on the target site */
    private mediaAttachmentExists;
    /** Resolve WP user id by slug; returns undefined if not found */
    resolveAuthorId(authorSlug: string | undefined, dryRun: boolean): Promise<number | undefined>;
    buildAcfPayload(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
    importPost(post: ProcessedPost, options: {
        dryRun: boolean;
        skipFeaturedImage: boolean;
        reuseFeaturedMediaFromSite: boolean;
    }): Promise<{
        id?: number;
        link?: string;
        featuredMedia: FeaturedMediaOutcome;
        sourceAttachmentId?: number;
    }>;
    private static reportTimestamp;
    private writeImportReport;
    importAll(options: ImportOptions): Promise<ImportSummary>;
}
export {};
//# sourceMappingURL=ProcessedPostsImporter.d.ts.map