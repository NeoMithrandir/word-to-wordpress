/**
 * Bulk-import processed post JSON files into a fresh WordPress instance.
 *
 * Prerequisites on WordPress:
 * - Application password for REST API
 * - ACF + InScience acf-fields.php with show_in_rest enabled (see InScience-v2 wp-config)
 * - WPGraphQL optional for Astro; REST is used here
 *
 * Environment variables (put a `.env` file in the word-to-wordpress repo root — same
 * directory as `package.json`; `dotenv.config()` loads it when you run the script):
 *   WP_SITE_URL       e.g. https://cms.example.com
 *   WP_USERNAME       WordPress username
 *   WP_APP_PASSWORD   Application password (spaces allowed)
 *   PROCESSED_POSTS_DIR  Optional; defaults to ./saved-posts/fetch-2026-04-06T20-10-48-433Z/processed-posts
 *   IMPORT_DELAY_MS      Optional ms between posts (default 300)
 *   IMPORT_REUSE_EXISTING_MEDIA  If "1"/"true", same as --reuse-featured-media (cloned site with existing attachments)
 *
 * Usage:
 *   npx ts-node src/scripts/import-processed-posts.ts
 *   npx ts-node src/scripts/import-processed-posts.ts --dry-run
 *   npx ts-node src/scripts/import-processed-posts.ts --skip-featured-image
 *   npx ts-node src/scripts/import-processed-posts.ts --reuse-featured-media
 */

import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { ProcessedPostsImporter } from "../services/ProcessedPostsImporter";

dotenv.config();

function parseArgs(argv: string[]): {
  dryRun: boolean;
  skipFeaturedImage: boolean;
  reuseFeaturedMedia: boolean;
} {
  const envReuse = process.env.IMPORT_REUSE_EXISTING_MEDIA?.trim().toLowerCase();
  const reuseFromEnv = envReuse === "1" || envReuse === "true" || envReuse === "yes";
  return {
    dryRun: argv.includes("--dry-run"),
    skipFeaturedImage: argv.includes("--skip-featured-image"),
    reuseFeaturedMedia: argv.includes("--reuse-featured-media") || reuseFromEnv,
  };
}

function defaultProcessedDir(): string {
  const envDir = process.env.PROCESSED_POSTS_DIR?.trim();
  if (envDir) return path.resolve(envDir);

  const rel = path.join(
    process.cwd(),
    "saved-posts",
    "fetch-2026-04-06T20-10-48-433Z",
    "processed-posts"
  );
  return rel;
}

async function main(): Promise<void> {
  const { dryRun, skipFeaturedImage, reuseFeaturedMedia } = parseArgs(process.argv.slice(2));

  const siteUrl = process.env.WP_SITE_URL?.trim();
  const username = process.env.WP_USERNAME?.trim();
  const password = process.env.WP_APP_PASSWORD?.replace(/\s+/g, "") ?? "";

  if (!siteUrl || !username || !password) {
    console.error(
      "Missing env: WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD\n" +
        "Create a .env in word-to-wordpress or export these variables."
    );
    process.exit(1);
  }

  const processedPostsDir = defaultProcessedDir();
  if (!fs.existsSync(processedPostsDir)) {
    console.error(`Processed posts directory not found:\n  ${processedPostsDir}\n` + "Set PROCESSED_POSTS_DIR or run from repo root with saved-posts/…/processed-posts present.");
    process.exit(1);
  }

  const importer = new ProcessedPostsImporter({
    siteUrl,
    username,
    password,
  });

  const summary = await importer.importAll({
    processedPostsDir,
    dryRun,
    skipFeaturedImage,
    reuseFeaturedMediaFromSite: reuseFeaturedMedia,
    delayMs: Number(process.env.IMPORT_DELAY_MS || "300"),
  });

  console.log("\n--- Summary (full per-post rows are in the report JSON file) ---");
  console.log(
    JSON.stringify(
      {
        totalFiles: summary.totalFiles,
        created: summary.created,
        dryRunSimulated: summary.dryRunSimulated,
        failed: summary.failed,
        errors: summary.errors,
        reportPath: summary.reportPath,
      },
      null,
      2
    )
  );
  if (summary.failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
