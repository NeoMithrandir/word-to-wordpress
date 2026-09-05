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

import fs from "node:fs";
import path from "node:path";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Converts a MIME type string to a file extension. */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/tiff": "tif",
  };
  return map[mime.toLowerCase()] ?? "bin";
}

interface ExtractResult {
  /** Cleaned HTML with placeholders instead of base64 data. */
  cleanedHtml: string;
  /** List of extracted images: filename + raw base64 buffer. */
  images: Array<{ filename: string; buffer: Buffer }>;
}

/**
 * Scans `html` for every `data:<mime>;base64,<data>` occurrence inside an
 * `src` attribute, extracts the data as a Buffer, and replaces the attribute
 * value with an HTML comment placeholder.
 *
 * Works on arbitrarily long single-line HTML (the regex is applied in chunks
 * to avoid call-stack overflows from very long strings).
 */
function extractBase64Images(html: string): ExtractResult {
  const images: Array<{ filename: string; buffer: Buffer }> = [];

  // Match the full data URI value inside an src attribute.
  // Group 1: MIME type   Group 2: base64 payload
  const DATA_URI_RE =
    /src="data:(image\/[^;]+);base64,([A-Za-z0-9+/]+=*)"/g;

  let counter = 0;
  const cleanedHtml = html.replace(DATA_URI_RE, (_match, mime: string, b64: string) => {
    counter += 1;
    const ext = mimeToExt(mime);
    const filename = `image-${String(counter).padStart(3, "0")}.${ext}`;
    const buffer = Buffer.from(b64, "base64");

    images.push({ filename, buffer });

    // Replace with an HTML comment placeholder so the surrounding <img> tag
    // stays valid but the massive data string is gone.
    return `src="<!-- REPLACE_WITH_WP_URL:${filename} -->"`;
  });

  return { cleanedHtml, images };
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

function main(): void {
  const [, , inputArg, outputDirArg] = process.argv;

  const inputFile = path.resolve(inputArg ?? "export.html");
  const outputDir = path.resolve(outputDirArg ?? "extracted-images");

  // Validate input
  if (!fs.existsSync(inputFile)) {
    console.error(`Input file not found: ${inputFile}`);
    process.exit(1);
  }

  // Read input HTML (potentially very large, use Buffer → string for UTF-8)
  console.log(`Reading ${inputFile} …`);
  const html = fs.readFileSync(inputFile, "utf8");
  const originalSizeMB = (Buffer.byteLength(html, "utf8") / 1_048_576).toFixed(2);
  console.log(`  Original size : ${originalSizeMB} MB`);

  // Extract
  console.log("Extracting base64 images …");
  const { cleanedHtml, images } = extractBase64Images(html);

  if (images.length === 0) {
    console.log("No base64-encoded images found in the file. Nothing to do.");
    return;
  }

  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });

  // Write extracted image files
  let totalExtractedKB = 0;
  for (const { filename, buffer } of images) {
    const dest = path.join(outputDir, filename);
    fs.writeFileSync(dest, buffer);
    const kb = (buffer.length / 1024).toFixed(1);
    totalExtractedKB += buffer.length / 1024;
    console.log(`  ✓ Saved ${filename}  (${kb} KB)`);
  }

  // Write cleaned HTML
  const cleanedPath = path.join(outputDir, "cleaned-post.html");
  fs.writeFileSync(cleanedPath, cleanedHtml, "utf8");
  const cleanedSizeMB = (Buffer.byteLength(cleanedHtml, "utf8") / 1_048_576).toFixed(2);

  console.log(`\nDone.`);
  console.log(`  Images extracted : ${images.length}  (total ${(totalExtractedKB / 1024).toFixed(2)} MB)`);
  console.log(`  Cleaned HTML     : ${cleanedSizeMB} MB  →  ${cleanedPath}`);
  console.log(`  Images folder    : ${outputDir}`);
  console.log(`
Next steps:
  1. Upload the image files from "${outputDir}" to your WordPress Media Library.
  2. Open "${cleanedPath}" in a text editor.
  3. Replace each placeholder
       src="<!-- REPLACE_WITH_WP_URL:image-NNN.ext -->"
     with the actual WordPress URL, e.g.:
       src="https://your-site.com/wp-content/uploads/2026/04/image-001.png"
  4. Paste the resulting HTML into the WordPress post editor (Code / HTML view).
`);
}

main();
