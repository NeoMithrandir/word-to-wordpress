"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalSaveService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class LocalSaveService {
    constructor() {
        this.saveDirectory = path_1.default.join(process.cwd(), 'saved-posts');
        this.ensureSaveDirectory();
    }
    /**
     * Ensure the save directory exists
     */
    ensureSaveDirectory() {
        if (!fs_1.default.existsSync(this.saveDirectory)) {
            fs_1.default.mkdirSync(this.saveDirectory, { recursive: true });
            console.log('Created saved-posts directory');
        }
    }
    /**
     * Save post data locally as JSON
     */
    async savePost(content, postData) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `post-${timestamp}.json`;
            const filepath = path_1.default.join(this.saveDirectory, filename);
            const dataToSave = {
                savedAt: new Date().toISOString(),
                content,
                postData,
                metadata: {
                    originalTitle: content.title,
                    wordCount: content.wordCount,
                    hasFootnotes: content.footnotes.length > 0,
                    hasCitations: content.citations.length > 0,
                    hasEquations: content.equations && content.equations.length > 0,
                    imageCount: content.images.length,
                    equationCount: content.equations ? content.equations.length : 0
                }
            };
            fs_1.default.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
            console.log(`Post saved locally: ${filename}`);
            return filename;
        }
        catch (error) {
            console.error('Error saving post locally:', error);
            throw new Error('Failed to save post locally');
        }
    }
    /**
     * List all saved posts
     */
    async listSavedPosts() {
        try {
            const files = fs_1.default.readdirSync(this.saveDirectory);
            return files.filter(file => file.endsWith('.json'));
        }
        catch (error) {
            console.error('Error listing saved posts:', error);
            return [];
        }
    }
    /**
     * Load a saved post
     */
    async loadPost(filename) {
        try {
            const filepath = path_1.default.join(this.saveDirectory, filename);
            const data = fs_1.default.readFileSync(filepath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error('Error loading saved post:', error);
            throw new Error('Failed to load saved post');
        }
    }
}
exports.LocalSaveService = LocalSaveService;
//# sourceMappingURL=LocalSaveService.js.map