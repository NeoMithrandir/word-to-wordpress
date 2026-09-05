import sharp from 'sharp';

export interface OptimizedImage {
  buffer: Buffer;
  contentType: 'image/webp';
  extension: 'webp';
  width: number;
  height: number;
}

export interface OptimizeOptions {
  /** Maximum width OR height in pixels. Images smaller than this are kept at native size. */
  maxDim?: number;
  /** WebP quality 1–100 (sharp default 80). */
  quality?: number;
}

const DEFAULT_MAX_DIM = 1200;
const DEFAULT_QUALITY = 82;

/**
 * Convert a raster image buffer to WebP, downscaling so that the longer
 * side is at most `maxDim` pixels (1200 by default). Smaller images are
 * left at their native resolution — `withoutEnlargement: true` ensures
 * sharp never upscales.
 *
 * Returns the encoded WebP bytes plus the actual output dimensions, so
 * callers can build correct multipart filenames / log lines.
 */
export async function convertToWebp(
  input: Buffer,
  options: OptimizeOptions = {}
): Promise<OptimizedImage> {
  const maxDim = options.maxDim ?? DEFAULT_MAX_DIM;
  const quality = options.quality ?? DEFAULT_QUALITY;

  let pipeline = sharp(input, { failOn: 'none' }).rotate(); // honour EXIF orientation
  const metadata = await pipeline.metadata();

  const needsResize =
    (metadata.width ?? 0) > maxDim || (metadata.height ?? 0) > maxDim;

  if (needsResize) {
    pipeline = pipeline.resize({
      width: maxDim,
      height: maxDim,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  const { data, info } = await pipeline
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    contentType: 'image/webp',
    extension: 'webp',
    width: info.width,
    height: info.height,
  };
}
