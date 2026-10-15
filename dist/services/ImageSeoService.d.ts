export type ImageSeoSource = 'alt' | 'caption' | 'heading' | 'title' | 'ai';
export interface ImageSeoContext {
    wordAlt: string;
    caption: string;
    heading: string;
    articleTitle: string;
}
export interface ImageSeoFields {
    filename: string;
    alt: string;
    title: string;
    caption?: string;
    seoSource: ImageSeoSource;
}
/** Image fields ImageSeoService reads and writes. Compatible with ProcessedImage. */
export interface ImageSeoTarget {
    id: string;
    filename: string;
    alt: string;
    title: string;
    caption?: string;
    seoSource?: ImageSeoSource;
    data: Buffer | string | {
        data: number[];
    };
    contentType: string;
}
export declare function isGenericAlt(alt: string): boolean;
export declare function isGenericHeading(heading: string): boolean;
export declare function looksLikeCaption(text: string, options?: {
    italic?: boolean;
}): boolean;
export declare function isWeakImageContext(ctx: ImageSeoContext): boolean;
export declare function uniquifyFilenameStem(stem: string, used: Set<string>): string;
export declare function imageSeoSourceLabel(source: ImageSeoSource): string;
export declare function seoFromContext(ctx: ImageSeoContext, fallbackId: string): ImageSeoFields;
/**
 * Set alt on matching data-URI images and wrap them in figure/figcaption
 * when a caption is present and the image is not already in a figure.
 */
export declare function rewriteImageSeoHtml(html: string, images: ImageSeoTarget[]): string;
export declare class ImageSeoService {
    enrichWeakImages(images: ImageSeoTarget[], articleTitle: string): Promise<void>;
    private suggestFromVision;
}
export declare const imageSeoService: ImageSeoService;
//# sourceMappingURL=ImageSeoService.d.ts.map