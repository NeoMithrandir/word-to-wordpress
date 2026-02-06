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
    /**
     * Map a MIME content-type to a file extension.
     * We convert everything to .jpg on disk unless it's PNG/GIF/WebP.
     */
    private imageExtension;
    /**
     * Save every image from ProcessedContent.images as an individual file
     * inside `folderPath`, and return a map from the original base64 data-URI
     * prefix to the relative filename so the HTML can be rewritten.
     *
     * A companion `images-metadata.json` is written to the same folder.
     */
    private saveImages;
    /**
     * Replace every base64 data-URI `<img>` in `html` with a relative file
     * path, using the ProcessedImage array to match on content-type + data.
     *
     * Returns the rewritten HTML string.
     */
    private replaceDataUrisWithFiles;
    /**
     * Save the post as an HTML file inside its own folder, with images
     * extracted to separate files alongside it.
     *
     * Folder structure:
     *   saved-posts/
     *     post-<timestamp>/
     *       index.html
     *       image-1.jpg
     *       image-2.png
     *       images-metadata.json
     *
     * Returns the folder name (e.g. "post-2025-09-11T19-27-58-751Z").
     */
    savePostAsHtml(content: ProcessedContent, postData: PostData): Promise<string>;
    /**
     * Generate complete HTML document
     */
    private generateHtmlDocument;
}
//# sourceMappingURL=LocalSaveService.d.ts.map