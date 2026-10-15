"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToWebp = convertToWebp;
const sharp_1 = __importDefault(require("sharp"));
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
async function convertToWebp(input, options = {}) {
    const maxDim = options.maxDim ?? DEFAULT_MAX_DIM;
    const quality = options.quality ?? DEFAULT_QUALITY;
    let pipeline = (0, sharp_1.default)(input, { failOn: 'none' }).rotate(); // honour EXIF orientation
    const metadata = await pipeline.metadata();
    const needsResize = (metadata.width ?? 0) > maxDim || (metadata.height ?? 0) > maxDim;
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
//# sourceMappingURL=ImageOptimizer.js.map