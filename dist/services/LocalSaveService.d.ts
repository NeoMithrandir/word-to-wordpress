import { ProcessedContent } from './DocumentProcessor';
import { PostData } from './WordPressService';
export declare class LocalSaveService {
    private saveDirectory;
    constructor();
    /**
     * Ensure the save directory exists
     */
    private ensureSaveDirectory;
    /**
     * Save post data locally as JSON
     */
    savePost(content: ProcessedContent, postData: PostData): Promise<string>;
    /**
     * List all saved posts
     */
    listSavedPosts(): Promise<string[]>;
    /**
     * Load a saved post
     */
    loadPost(filename: string): Promise<any>;
}
//# sourceMappingURL=LocalSaveService.d.ts.map