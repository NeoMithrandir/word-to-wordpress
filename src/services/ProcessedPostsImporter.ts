import axios, { AxiosInstance } from "axios";
import FormData from "form-data";
import fs from "node:fs";
import path from "node:path";
import { mapCategoryToTarget } from "../lib/categoryMigration";

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
export type FeaturedMediaOutcome =
  | "none"
  | "skipped_by_flag"
  | "reused_attachment_id"
  | "uploaded_from_source_url"
  | "upload_failed_no_fallback"
  | "dry_run";

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
  errors: Array<{ file: string; message: string }>;
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
  title: { rendered: string };
  content: { rendered: string; protected?: boolean };
  excerpt: { rendered: string; protected?: boolean };
  author?: { id: number; slug: string; name: string };
  featured_media?: number;
  featured_image?: {
    id: number;
    source_url: string;
    alt_text?: string;
    media_details?: { file?: string };
  } | null;
  categories: Array<{ id: number; slug: string; name: string; description?: string; parent?: number }>;
  tags: Array<{ id: number; slug: string; name: string }>;
  sticky?: boolean;
  format?: string;
  template?: string;
  comment_status?: string;
  ping_status?: string;
  meta?: Record<string, unknown>;
}

export class ProcessedPostsImporter {
  private client: AxiosInstance;

  constructor(private readonly config: WordPressImportConfig) {
    const baseURL = `${config.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2`;
    this.client = axios.create({
      baseURL,
      auth: { username: config.username, password: config.password },
      headers: { Accept: "application/json" },
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  private async sleep(ms: number): Promise<void> {
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  private filenameFromUrl(imageUrl: string, fallback: string): string {
    try {
      const u = new URL(imageUrl);
      const base = path.basename(u.pathname);
      if (base && base.includes(".")) return base.slice(0, 200);
    } catch {
      /* ignore */
    }
    return fallback;
  }

  private guessMime(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    return "image/jpeg";
  }

  /** GET category by slug; create if missing */
  async ensureCategory(slug: string, name: string, dryRun: boolean): Promise<number> {
    const res = await this.client.get("/categories", { params: { slug, per_page: 1 } });
    const existing = res.data?.[0];
    if (existing?.id) return existing.id as number;

    if (dryRun) {
      console.log(`  [dry-run] would create category: ${slug} (${name})`);
      return -1;
    }

    const created = await this.client.post("/categories", { slug, name, description: "" });
    return created.data.id as number;
  }

  /** GET tag by slug; create if missing */
  async ensureTag(slug: string, name: string, dryRun: boolean): Promise<number> {
    const res = await this.client.get("/tags", { params: { slug, per_page: 1 } });
    const existing = res.data?.[0];
    if (existing?.id) return existing.id as number;

    if (dryRun) {
      console.log(`  [dry-run] would create tag: ${slug} (${name})`);
      return -1;
    }

    const created = await this.client.post("/tags", { slug, name, description: "" });
    return created.data.id as number;
  }

  /** Download image from URL and upload to media library */
  async uploadMediaFromUrl(
    imageUrl: string,
    altText: string,
    dryRun: boolean
  ): Promise<number | null> {
    if (dryRun) {
      console.log(`  [dry-run] would upload media from: ${imageUrl}`);
      return null;
    }

    const imgRes = await axios.get<ArrayBuffer>(imageUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: Infinity,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const buffer = Buffer.from(imgRes.data);
    const filename = this.filenameFromUrl(imageUrl, "featured.jpg");
    const mime = this.guessMime(filename);

    const form = new FormData();
    form.append("file", buffer, { filename, contentType: mime });
    if (altText) form.append("alt_text", altText);

    const mediaRes = await this.client.post("/media", form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
    });

    return mediaRes.data?.id ?? null;
  }

  /** True if an attachment with this ID exists on the target site */
  private async mediaAttachmentExists(mediaId: number): Promise<boolean> {
    try {
      await this.client.get(`/media/${mediaId}`);
      return true;
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 404) return false;
      throw e;
    }
  }

  /** Resolve WP user id by slug; returns undefined if not found */
  async resolveAuthorId(authorSlug: string | undefined, dryRun: boolean): Promise<number | undefined> {
    if (!authorSlug) return undefined;
    const res = await this.client.get("/users", { params: { slug: authorSlug, per_page: 1 } });
    const u = res.data?.[0];
    if (u?.id) return u.id as number;
    if (dryRun) return undefined;
    console.warn(`  Warning: no user with slug "${authorSlug}" — post will use authenticated author`);
    return undefined;
  }

  buildAcfPayload(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    if (!meta) return undefined;

    const abstract = meta.article_abstract;
    const reading = meta.article_reading_time;
    const contentType = meta.article_content_type;
    const yt = meta.article_youtube_url;
    const pod = meta.article_podcast_url;
    const featured = meta.article_featured;
    const refs = meta.article_references;

    const acf: Record<string, unknown> = {};

    if (typeof abstract === "string") acf.article_abstract = abstract;
    if (typeof reading === "number") acf.article_reading_time = reading;
    if (typeof contentType === "string") acf.article_content_type = contentType;
    if (typeof yt === "string" && yt.trim()) acf.article_youtube_url = yt.trim();
    if (typeof pod === "string" && pod.trim()) acf.article_podcast_url = pod.trim();
    if (typeof featured === "boolean") acf.article_featured = featured;
    if (typeof refs === "string") acf.article_references = refs;

    return Object.keys(acf).length ? acf : undefined;
  }

  async importPost(
    post: ProcessedPost,
    options: {
      dryRun: boolean;
      skipFeaturedImage: boolean;
      reuseFeaturedMediaFromSite: boolean;
    }
  ): Promise<{
    id?: number;
    link?: string;
    featuredMedia: FeaturedMediaOutcome;
    sourceAttachmentId?: number;
  }> {
    const { dryRun, skipFeaturedImage, reuseFeaturedMediaFromSite } = options;

    const categoryIds: number[] = [];
    const seenCat = new Set<number>();
    for (const c of post.categories || []) {
      const target = mapCategoryToTarget({ slug: c.slug, name: c.name });
      const id = await this.ensureCategory(target.slug, target.name, dryRun);
      if (id >= 0 && !seenCat.has(id)) {
        seenCat.add(id);
        categoryIds.push(id);
      }
    }

    const tagIds: number[] = [];
    const seenTag = new Set<number>();
    for (const t of post.tags || []) {
      const id = await this.ensureTag(t.slug, t.name, dryRun);
      if (id >= 0 && !seenTag.has(id)) {
        seenTag.add(id);
        tagIds.push(id);
      }
    }

    let featuredMediaId: number | undefined;
    let featuredMedia: FeaturedMediaOutcome = "none";
    let sourceAttachmentId: number | undefined;

    if (skipFeaturedImage) {
      featuredMedia = "skipped_by_flag";
    } else {
      const fromJson =
        post.featured_media && post.featured_media > 0
          ? post.featured_media
          : post.featured_image?.id && post.featured_image.id > 0
            ? post.featured_image.id
            : undefined;

      if (reuseFeaturedMediaFromSite && fromJson) {
        sourceAttachmentId = fromJson;
        if (dryRun) {
          console.log(`  [dry-run] would check attachment ${fromJson}, then upload from URL if missing`);
          featuredMedia = "dry_run";
        } else if (await this.mediaAttachmentExists(fromJson)) {
          featuredMediaId = fromJson;
          featuredMedia = "reused_attachment_id";
          console.log(`  Featured image: reused attachment ${fromJson}`);
        }
      }

      if (!featuredMediaId && post.featured_image?.source_url) {
        const mid = await this.uploadMediaFromUrl(
          post.featured_image.source_url,
          post.featured_image.alt_text || "",
          dryRun
        );
        if (mid) {
          featuredMediaId = mid;
          featuredMedia = "uploaded_from_source_url";
        } else if (dryRun) {
          if (featuredMedia === "none") featuredMedia = "dry_run";
        } else {
          featuredMedia = "upload_failed_no_fallback";
        }
      }
    }

    const authorId = await this.resolveAuthorId(post.author?.slug, dryRun);
    const acf = this.buildAcfPayload(post.meta as Record<string, unknown> | undefined);

    const body: Record<string, unknown> = {
      slug: post.slug,
      status: post.status === "publish" ? "publish" : "draft",
      title: post.title.rendered,
      content: post.content.rendered,
      excerpt: post.excerpt.rendered,
      date: post.date,
      date_gmt: post.date_gmt || post.date,
      categories: categoryIds.filter((id) => id > 0),
      tags: tagIds.filter((id) => id > 0),
      sticky: !!post.sticky,
      format: post.format || "standard",
      comment_status: post.comment_status || "open",
      ping_status: post.ping_status || "open",
    };

    if (authorId) body.author = authorId;
    if (featuredMediaId) body.featured_media = featuredMediaId;
    if (acf) body.acf = acf;

    if (dryRun) {
      console.log(`  [dry-run] would create post: ${post.slug} (${post.title.rendered.slice(0, 60)}…)`);
      return { featuredMedia, sourceAttachmentId };
    }

    const res = await this.client.post("/posts", body);
    return {
      id: res.data?.id,
      link: res.data?.link,
      featuredMedia,
      sourceAttachmentId,
    };
  }

  private static reportTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
  }

  private writeImportReport(
    processedPostsDir: string,
    summary: ImportSummary,
    meta: {
      dryRun: boolean;
      skipFeaturedImage: boolean;
      reuseFeaturedMediaFromSite: boolean;
      siteUrl: string;
    }
  ): string {
    const reportPath = path.join(
      processedPostsDir,
      `import-report-${ProcessedPostsImporter.reportTimestamp()}.json`
    );
    const payload = {
      generatedAt: new Date().toISOString(),
      siteUrl: meta.siteUrl,
      options: {
        dryRun: meta.dryRun,
        skipFeaturedImage: meta.skipFeaturedImage,
        reuseFeaturedMediaFromSite: meta.reuseFeaturedMediaFromSite,
      },
      summary: {
        totalFiles: summary.totalFiles,
        created: summary.created,
        dryRunSimulated: summary.dryRunSimulated,
        failed: summary.failed,
        errors: summary.errors,
        results: summary.results,
      },
    };
    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf-8");
    return reportPath;
  }

  async importAll(options: ImportOptions): Promise<ImportSummary> {
    const {
      processedPostsDir,
      dryRun = false,
      delayMs = 250,
      skipFeaturedImage = false,
      reuseFeaturedMediaFromSite = false,
    } = options;

    const summary: ImportSummary = {
      totalFiles: 0,
      created: 0,
      dryRunSimulated: 0,
      failed: 0,
      errors: [],
      results: [],
    };

    if (!fs.existsSync(processedPostsDir)) {
      throw new Error(`Directory not found: ${processedPostsDir}`);
    }

    const files = fs
      .readdirSync(processedPostsDir)
      .filter(
        (f) =>
          f.startsWith("post-") &&
          f.endsWith(".json") &&
          f !== "_migration-report.json" &&
          !f.startsWith("import-report-")
      )
      .sort((a, b) => {
        const na = parseInt(a.replace(/^post-/, "").replace(/\.json$/, ""), 10);
        const nb = parseInt(b.replace(/^post-/, "").replace(/\.json$/, ""), 10);
        return na - nb;
      });

    summary.totalFiles = files.length;
    console.log(`Importing ${files.length} posts from ${processedPostsDir}`);
    console.log(
      `Dry run: ${dryRun}, skip featured image: ${skipFeaturedImage}, reuse featured media id: ${reuseFeaturedMediaFromSite}\n`
    );

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const num = i + 1;
      const total = files.length;
      console.log(`\n[${num}/${total}] ${file}`);
      const full = path.join(processedPostsDir, file);
      try {
        const raw = JSON.parse(fs.readFileSync(full, "utf-8")) as ProcessedPost;
        const postResult = await this.importPost(raw, {
          dryRun,
          skipFeaturedImage,
          reuseFeaturedMediaFromSite,
        });
        if (dryRun) summary.dryRunSimulated++;
        else summary.created++;
        summary.results.push({
          file,
          slug: raw.slug,
          outcome: "success",
          wordPressPostId: postResult.id,
          postLink: postResult.link,
          featuredMedia: postResult.featuredMedia,
          sourceAttachmentId: postResult.sourceAttachmentId,
        });
        if (!dryRun && postResult.id != null) {
          console.log(
            `  OK — post ID ${postResult.id}${postResult.link ? ` — ${postResult.link}` : ""}`
          );
        }
      } catch (e) {
        summary.failed++;
        const message = e instanceof Error ? e.message : String(e);
        summary.errors.push({ file, message });
        let slug = "unknown";
        try {
          const raw = JSON.parse(fs.readFileSync(full, "utf-8")) as ProcessedPost;
          slug = raw.slug;
        } catch {
          /* ignore */
        }
        summary.results.push({
          file,
          slug,
          outcome: "failed",
          featuredMedia: "none",
          error: message,
        });
        console.error(`ERROR [${num}/${total}] ${file}: ${message}`);
        if (axios.isAxiosError(e)) {
          console.error(JSON.stringify(e.response?.data, null, 2));
        }
      }
      await this.sleep(delayMs);
    }

    summary.reportPath = this.writeImportReport(processedPostsDir, summary, {
      dryRun,
      skipFeaturedImage,
      reuseFeaturedMediaFromSite,
      siteUrl: this.config.siteUrl,
    });
    console.log(`\nReport file: ${summary.reportPath}`);

    return summary;
  }
}
