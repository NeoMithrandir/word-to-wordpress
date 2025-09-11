import { ProcessedContent } from './DocumentProcessor';
export interface WordPressConfig {
    siteUrl: string;
    username: string;
    password: string;
}
export interface PostData {
    title?: string;
    status: 'draft' | 'publish' | 'private';
    categories?: number[];
    tags?: number[];
    excerpt?: string;
    featuredImage?: number;
    author?: number;
}
export interface WordPressPost {
    id: number;
    title: {
        rendered: string;
    };
    content: {
        rendered: string;
    };
    link: string;
    status: string;
    date: string;
    modified: string;
}
export declare class WordPressService {
    private apiClient;
    /**
     * Initialize WordPress API client
     */
    private initializeClient;
    /**
     * Test WordPress connection
     */
    testConnection(config: WordPressConfig): Promise<boolean>;
    /**
     * Publish content to WordPress
     */
    publishPost(content: ProcessedContent, config: WordPressConfig, postData: PostData): Promise<WordPressPost>;
    /**
     * Prepare post content with WordPress-specific formatting
     */
    private preparePostContent;
    /**
     * Upload images to WordPress media library
     */
    private uploadImages;
    /**
     * Get file extension from content type
     */
    private getFileExtension;
    /**
     * Get WordPress categories
     */
    getCategories(config: WordPressConfig): Promise<any[]>;
    /**
     * Get WordPress tags
     */
    getTags(config: WordPressConfig): Promise<any[]>;
    /**
     * Create a new category
     */
    createCategory(config: WordPressConfig, name: string, description?: string): Promise<any>;
    /**
     * Create a new tag
     */
    createTag(config: WordPressConfig, name: string, description?: string): Promise<any>;
}
//# sourceMappingURL=WordPressService.d.ts.map