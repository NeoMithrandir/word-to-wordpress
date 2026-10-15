/**
 * extract-base64-images.ts
 *
 * Reads an HTML file that has base64-encoded images embedded as data URIs,
 * extracts each image to a standalone file, and writes a cleaned HTML file
 * where each `src="data:image/...;base64,..."` is replaced with a placeholder
 * comment you can fill in after uploading the images to WordPress.
 *
 * Why this is needed:
 *   WordPress pages with multi-megabyte inline base64 images cause blank / white
 *   pages because PHP memory limits, MySQL max_allowed_packet, and the browser's
 *   JS heap are all overwhelmed before any layout can be rendered.
 *
 * Usage:
 *   npx ts-node src/scripts/extract-base64-images.ts [input.html] [output-dir]
 *
 * Defaults:
 *   input  : export.html  (in cwd)
 *   output : ./extracted-images/   (images + cleaned HTML written here)
 *
 * After running:
 *   1. Upload the image files from ./extracted-images/ to your WordPress Media Library.
 *   2. Open cleaned-post.html from ./extracted-images/.
 *   3. Search for <!-- REPLACE_WITH_WP_URL:image-001.png --> and replace each
 *      placeholder with the actual WordPress media URL for that image.
 *   4. Paste the cleaned HTML into the WordPress post editor (Text / HTML view).
 */
export {};
//# sourceMappingURL=extract-base64-images.d.ts.map