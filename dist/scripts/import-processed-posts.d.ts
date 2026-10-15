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
export {};
//# sourceMappingURL=import-processed-posts.d.ts.map