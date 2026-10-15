"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessedPostsImporter = void 0;
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const categoryMigration_1 = require("../lib/categoryMigration");
class ProcessedPostsImporter {
    constructor(config) {
        this.config = config;
        const baseURL = `${config.siteUrl.replace(/\/$/, "")}/wp-json/wp/v2`;
        this.client = axios_1.default.create({
            baseURL,
            auth: { username: config.username, password: config.password },
            headers: { Accept: "application/json" },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });
    }
    async sleep(ms) {
        if (ms > 0)
            await new Promise((r) => setTimeout(r, ms));
    }
    filenameFromUrl(imageUrl, fallback) {
        try {
            const u = new URL(imageUrl);
            const base = node_path_1.default.basename(u.pathname);
            if (base && base.includes("."))
                return base.slice(0, 200);
        }
        catch {
            /* ignore */
        }
        return fallback;
    }
    guessMime(filename) {
        const ext = node_path_1.default.extname(filename).toLowerCase();
        if (ext === ".png")
            return "image/png";
        if (ext === ".webp")
            return "image/webp";
        if (ext === ".gif")
            return "image/gif";
        return "image/jpeg";
    }
    /** GET category by slug; create if missing */
    async ensureCategory(slug, name, dryRun) {
        const res = await this.client.get("/categories", { params: { slug, per_page: 1 } });
        const existing = res.data?.[0];
        if (existing?.id)
            return existing.id;
        if (dryRun) {
            console.log(`  [dry-run] would create category: ${slug} (${name})`);
            return -1;
        }
        const created = await this.client.post("/categories", { slug, name, description: "" });
        return created.data.id;
    }
    /** GET tag by slug; create if missing */
    async ensureTag(slug, name, dryRun) {
        const res = await this.client.get("/tags", { params: { slug, per_page: 1 } });
        const existing = res.data?.[0];
        if (existing?.id)
            return existing.id;
        if (dryRun) {
            console.log(`  [dry-run] would create tag: ${slug} (${name})`);
            return -1;
        }
        const created = await this.client.post("/tags", { slug, name, description: "" });
        return created.data.id;
    }
    /** Download image from URL and upload to media library */
    async uploadMediaFromUrl(imageUrl, altText, dryRun) {
        if (dryRun) {
            console.log(`  [dry-run] would upload media from: ${imageUrl}`);
            return null;
        }
        const imgRes = await axios_1.default.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: 60000,
            maxContentLength: Infinity,
            validateStatus: (s) => s >= 200 && s < 400,
        });
        const buffer = Buffer.from(imgRes.data);
        const filename = this.filenameFromUrl(imageUrl, "featured.jpg");
        const mime = this.guessMime(filename);
        const form = new form_data_1.default();
        form.append("file", buffer, { filename, contentType: mime });
        if (altText)
            form.append("alt_text", altText);
        const mediaRes = await this.client.post("/media", form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
        });
        return mediaRes.data?.id ?? null;
    }
    /** True if an attachment with this ID exists on the target site */
    async mediaAttachmentExists(mediaId) {
        try {
            await this.client.get(`/media/${mediaId}`);
            return true;
        }
        catch (e) {
            if (axios_1.default.isAxiosError(e) && e.response?.status === 404)
                return false;
            throw e;
        }
    }
    /** Resolve WP user id by slug; returns undefined if not found */
    async resolveAuthorId(authorSlug, dryRun) {
        if (!authorSlug)
            return undefined;
        const res = await this.client.get("/users", { params: { slug: authorSlug, per_page: 1 } });
        const u = res.data?.[0];
        if (u?.id)
            return u.id;
        if (dryRun)
            return undefined;
        console.warn(`  Warning: no user with slug "${authorSlug}" — post will use authenticated author`);
        return undefined;
    }
    buildAcfPayload(meta) {
        if (!meta)
            return undefined;
        const abstract = meta.article_abstract;
        const reading = meta.article_reading_time;
        const contentType = meta.article_content_type;
        const yt = meta.article_youtube_url;
        const pod = meta.article_podcast_url;
        const featured = meta.article_featured;
        const refs = meta.article_references;
        const socialImage = meta.article_social_image;
        const faq = meta.article_faq;
        const related = meta.article_related;
        const simpleDimotikou = meta.article_simple_dimotikou;
        const simpleGymnasiou = meta.article_simple_gymnasiou;
        const simpleLykeiou = meta.article_simple_lykeiou;
        const simpleSummary = meta.article_simple_summary;
        const acf = {};
        if (typeof abstract === "string")
            acf.article_abstract = abstract;
        if (typeof reading === "number")
            acf.article_reading_time = reading;
        if (typeof contentType === "string")
            acf.article_content_type = contentType;
        if (typeof yt === "string" && yt.trim())
            acf.article_youtube_url = yt.trim();
        if (typeof pod === "string" && pod.trim())
            acf.article_podcast_url = pod.trim();
        if (typeof featured === "boolean")
            acf.article_featured = featured;
        if (typeof refs === "string")
            acf.article_references = refs;
        // Custom social share image — ACF image field accepts a plain attachment id on write.
        if (typeof socialImage === "number" && socialImage > 0) {
            acf.article_social_image = socialImage;
        }
        // FAQ repeater — array of { question, answer } string pairs.
        if (Array.isArray(faq)) {
            const rows = faq
                .filter((row) => !!row &&
                typeof row === "object" &&
                typeof row.question === "string" &&
                typeof row.answer === "string" &&
                row.question.trim().length > 0 &&
                row.answer.trim().length > 0)
                .map((row) => ({ question: row.question.trim(), answer: row.answer.trim() }));
            if (rows.length > 0)
                acf.article_faq = rows;
        }
        // Curated related posts — ACF relationship field accepts an array of post ids.
        if (Array.isArray(related)) {
            const ids = related.filter((id) => typeof id === "number" && id > 0);
            if (ids.length > 0)
                acf.article_related = ids;
        }
        if (typeof simpleDimotikou === "string" && simpleDimotikou.trim()) {
            acf.article_simple_dimotikou = simpleDimotikou.trim();
        }
        if (typeof simpleGymnasiou === "string" && simpleGymnasiou.trim()) {
            acf.article_simple_gymnasiou = simpleGymnasiou.trim();
        }
        if (typeof simpleLykeiou === "string" && simpleLykeiou.trim()) {
            acf.article_simple_lykeiou = simpleLykeiou.trim();
        }
        if (typeof simpleSummary === "string" && simpleSummary.trim()) {
            acf.article_simple_summary = simpleSummary.trim();
        }
        return Object.keys(acf).length ? acf : undefined;
    }
    async importPost(post, options) {
        const { dryRun, skipFeaturedImage, reuseFeaturedMediaFromSite } = options;
        const categoryIds = [];
        const seenCat = new Set();
        for (const c of post.categories || []) {
            const target = (0, categoryMigration_1.mapCategoryToTarget)({ slug: c.slug, name: c.name });
            const id = await this.ensureCategory(target.slug, target.name, dryRun);
            if (id >= 0 && !seenCat.has(id)) {
                seenCat.add(id);
                categoryIds.push(id);
            }
        }
        const tagIds = [];
        const seenTag = new Set();
        for (const t of post.tags || []) {
            const id = await this.ensureTag(t.slug, t.name, dryRun);
            if (id >= 0 && !seenTag.has(id)) {
                seenTag.add(id);
                tagIds.push(id);
            }
        }
        let featuredMediaId;
        let featuredMedia = "none";
        let sourceAttachmentId;
        if (skipFeaturedImage) {
            featuredMedia = "skipped_by_flag";
        }
        else {
            const fromJson = post.featured_media && post.featured_media > 0
                ? post.featured_media
                : post.featured_image?.id && post.featured_image.id > 0
                    ? post.featured_image.id
                    : undefined;
            if (reuseFeaturedMediaFromSite && fromJson) {
                sourceAttachmentId = fromJson;
                if (dryRun) {
                    console.log(`  [dry-run] would check attachment ${fromJson}, then upload from URL if missing`);
                    featuredMedia = "dry_run";
                }
                else if (await this.mediaAttachmentExists(fromJson)) {
                    featuredMediaId = fromJson;
                    featuredMedia = "reused_attachment_id";
                    console.log(`  Featured image: reused attachment ${fromJson}`);
                }
            }
            if (!featuredMediaId && post.featured_image?.source_url) {
                const mid = await this.uploadMediaFromUrl(post.featured_image.source_url, post.featured_image.alt_text || "", dryRun);
                if (mid) {
                    featuredMediaId = mid;
                    featuredMedia = "uploaded_from_source_url";
                }
                else if (dryRun) {
                    if (featuredMedia === "none")
                        featuredMedia = "dry_run";
                }
                else {
                    featuredMedia = "upload_failed_no_fallback";
                }
            }
        }
        const authorId = await this.resolveAuthorId(post.author?.slug, dryRun);
        const acf = this.buildAcfPayload(post.meta);
        const body = {
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
        if (authorId)
            body.author = authorId;
        if (featuredMediaId)
            body.featured_media = featuredMediaId;
        if (acf)
            body.acf = acf;
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
    static reportTimestamp() {
        return new Date().toISOString().replace(/[:.]/g, "-");
    }
    writeImportReport(processedPostsDir, summary, meta) {
        const reportPath = node_path_1.default.join(processedPostsDir, `import-report-${ProcessedPostsImporter.reportTimestamp()}.json`);
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
        node_fs_1.default.writeFileSync(reportPath, JSON.stringify(payload, null, 2), "utf-8");
        return reportPath;
    }
    async importAll(options) {
        const { processedPostsDir, dryRun = false, delayMs = 250, skipFeaturedImage = false, reuseFeaturedMediaFromSite = false, } = options;
        const summary = {
            totalFiles: 0,
            created: 0,
            dryRunSimulated: 0,
            failed: 0,
            errors: [],
            results: [],
        };
        if (!node_fs_1.default.existsSync(processedPostsDir)) {
            throw new Error(`Directory not found: ${processedPostsDir}`);
        }
        const files = node_fs_1.default
            .readdirSync(processedPostsDir)
            .filter((f) => f.startsWith("post-") &&
            f.endsWith(".json") &&
            f !== "_migration-report.json" &&
            !f.startsWith("import-report-"))
            .sort((a, b) => {
            const na = parseInt(a.replace(/^post-/, "").replace(/\.json$/, ""), 10);
            const nb = parseInt(b.replace(/^post-/, "").replace(/\.json$/, ""), 10);
            return na - nb;
        });
        summary.totalFiles = files.length;
        console.log(`Importing ${files.length} posts from ${processedPostsDir}`);
        console.log(`Dry run: ${dryRun}, skip featured image: ${skipFeaturedImage}, reuse featured media id: ${reuseFeaturedMediaFromSite}\n`);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const num = i + 1;
            const total = files.length;
            console.log(`\n[${num}/${total}] ${file}`);
            const full = node_path_1.default.join(processedPostsDir, file);
            try {
                const raw = JSON.parse(node_fs_1.default.readFileSync(full, "utf-8"));
                const postResult = await this.importPost(raw, {
                    dryRun,
                    skipFeaturedImage,
                    reuseFeaturedMediaFromSite,
                });
                if (dryRun)
                    summary.dryRunSimulated++;
                else
                    summary.created++;
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
                    console.log(`  OK — post ID ${postResult.id}${postResult.link ? ` — ${postResult.link}` : ""}`);
                }
            }
            catch (e) {
                summary.failed++;
                const message = e instanceof Error ? e.message : String(e);
                summary.errors.push({ file, message });
                let slug = "unknown";
                try {
                    const raw = JSON.parse(node_fs_1.default.readFileSync(full, "utf-8"));
                    slug = raw.slug;
                }
                catch {
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
                if (axios_1.default.isAxiosError(e)) {
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
exports.ProcessedPostsImporter = ProcessedPostsImporter;
//# sourceMappingURL=ProcessedPostsImporter.js.map