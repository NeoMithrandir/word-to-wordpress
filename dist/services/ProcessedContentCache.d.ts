import { ProcessedContent, ProcessedImage } from './DocumentProcessor';
import { ImageSeoSource } from './ImageSeoService';
export interface ImageMetaOverlay {
    id: string;
    filename?: string;
    alt: string;
    title: string;
    caption?: string;
    seoSource?: ImageSeoSource;
    contentType: string;
}
/** Editable fields the client may send back without image binaries. */
export interface ProcessedContentOverlay {
    title?: string;
    excerpt?: string;
    /** Body HTML; data-URIs may be replaced with [image:id] placeholders. */
    content?: string;
    footnotes?: ProcessedContent['footnotes'];
    citations?: ProcessedContent['citations'];
    equations?: ProcessedContent['equations'];
    wordCount?: number;
    images?: ImageMetaOverlay[];
}
export declare function storeProcessedContent(content: ProcessedContent): string;
export declare function getProcessedContent(contentId: string | undefined): ProcessedContent | undefined;
export declare function updateProcessedContent(contentId: string, overlay: ProcessedContentOverlay): ProcessedContent | undefined;
export declare function mergeProcessedContent(cached: ProcessedContent, overlay?: ProcessedContentOverlay): ProcessedContent;
/** JSON-safe image payloads for the browser preview (base64, not Buffer number arrays). */
export declare function serializeImagesForClient(images: ProcessedImage[]): Array<Omit<ProcessedImage, 'data'> & {
    data: string;
}>;
//# sourceMappingURL=ProcessedContentCache.d.ts.map