import { ProcessedContent, ProcessedImage } from './DocumentProcessor';
export type ReviewProviderId = 'anthropic' | 'openai' | 'gemini';
export interface ReviewModelOption {
    id: string;
    label: string;
}
export interface ReviewProviderOption {
    id: ReviewProviderId;
    label: string;
    configured: boolean;
    models: ReviewModelOption[];
    defaultModel: string;
}
export interface ArticleReviewInput {
    title: string;
    excerpt: string;
    content: string;
    footnotes: ProcessedContent['footnotes'];
    citations: ProcessedContent['citations'];
    images: Array<Pick<ProcessedImage, 'id' | 'filename' | 'alt' | 'title' | 'caption'> & {
        data?: ProcessedImage['data'] | string;
        contentType?: string;
    }>;
}
export interface ArticleReviewArticle {
    title: string;
    excerpt: string;
    content: string;
    slug: string;
    footnotes: ProcessedContent['footnotes'];
    citations: ProcessedContent['citations'];
    images: Array<{
        id: string;
        filename: string;
        alt: string;
        title: string;
        caption?: string;
    }>;
}
export interface ArticleReviewResult {
    article: ArticleReviewArticle;
    changeNotes: string[];
    layoutAttention: string[];
    provider: ReviewProviderId;
    model: string;
}
/** JSON rejects LaTeX like `\leftrightarrow`; double the unknown backslash. */
export declare function repairInvalidJsonEscapes(text: string): string;
export declare function parseModelJson(text: string): unknown;
export declare function invalidReviewJsonMessage(text: string): string;
/** Sonnet 5 / Opus 5 think by default; those tokens steal the JSON budget. */
export declare function anthropicDefaultsToAdaptiveThinking(model: string): boolean;
export declare function buildAnthropicReviewBody(model: string, prompt: string): Record<string, unknown>;
/** Replace data-URIs so the model sees layout without multi-megabyte payloads. */
export declare function stripImageDataUris(html: string, images: Array<{
    id: string;
    data?: unknown;
    contentType?: string;
}>): string;
export declare function restoreImageDataUris(html: string, images: Array<Pick<ProcessedImage, 'id' | 'data' | 'contentType'>>): string;
export declare function reviewPrompt(input: ArticleReviewInput): string;
export declare function applyReviewToArticle(input: ArticleReviewInput, parsed: unknown): {
    article: ArticleReviewArticle;
    changeNotes: string[];
    layoutAttention: string[];
};
export declare class ArticleReviewService {
    listProviders(): ReviewProviderOption[];
    resolveSelection(providerRaw: unknown, modelRaw: unknown): {
        provider: ReviewProviderId;
        model: string;
    };
    review(input: ArticleReviewInput, provider: ReviewProviderId, model: string): Promise<ArticleReviewResult>;
}
export declare const articleReviewService: ArticleReviewService;
//# sourceMappingURL=ArticleReviewService.d.ts.map