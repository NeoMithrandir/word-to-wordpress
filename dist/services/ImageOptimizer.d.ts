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
/**
 * Convert a raster image buffer to WebP, downscaling so that the longer
 * side is at most `maxDim` pixels (1200 by default). Smaller images are
 * left at their native resolution — `withoutEnlargement: true` ensures
 * sharp never upscales.
 *
 * Returns the encoded WebP bytes plus the actual output dimensions, so
 * callers can build correct multipart filenames / log lines.
 */
export declare function convertToWebp(input: Buffer, options?: OptimizeOptions): Promise<OptimizedImage>;
//# sourceMappingURL=ImageOptimizer.d.ts.map