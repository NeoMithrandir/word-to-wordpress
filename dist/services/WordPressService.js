"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordPressService = void 0;
const axios_1 = __importDefault(require("axios"));
class WordPressService {
    constructor() {
        this.apiClient = null;
    }
    /**
     * Initialize WordPress API client
     */
    initializeClient(config) {
        const baseURL = `${config.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`;
        return axios_1.default.create({
            baseURL,
            auth: {
                username: config.username,
                password: config.password
            },
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000
        });
    }
    /**
     * Test WordPress connection
     */
    async testConnection(config) {
        try {
            const client = this.initializeClient(config);
            // Test with a simple GET request to posts endpoint
            const response = await client.get('/posts', {
                params: {
                    per_page: 1,
                    status: 'any'
                }
            });
            return response.status === 200;
        }
        catch (error) {
            console.error('WordPress connection test failed:', error);
            return false;
        }
    }
    /**
     * Publish content to WordPress
     */
    async publishPost(content, config, postData) {
        try {
            console.log('Starting publishPost with config:', config.siteUrl);
            const client = this.initializeClient(config);
            // Prepare post content
            const postContent = await this.preparePostContent(content, client);
            console.log('Post content prepared, length:', postContent.length);
            // Prepare post data
            const postPayload = {
                title: postData.title || content.title,
                content: postContent,
                excerpt: postData.excerpt || content.excerpt,
                status: postData.status || 'draft',
                categories: postData.categories || [],
                tags: postData.tags || [],
                author: postData.author,
                featured_media: postData.featuredImage,
                // Add custom fields for footnotes and citations
                meta: {
                    footnotes: JSON.stringify(content.footnotes),
                    citations: JSON.stringify(content.citations),
                    word_count: content.wordCount
                }
            };
            console.log('Sending post to WordPress API...');
            console.log('Post title:', postPayload.title);
            console.log('Post status:', postPayload.status);
            // Create the post
            const response = await client.post('/posts', postPayload);
            console.log('Post created successfully:', response.data.id);
            console.log('Post URL:', response.data.link);
            // Upload images if any
            if (content.images && content.images.length > 0) {
                await this.uploadImages(content.images, response.data.id, client);
            }
            return response.data;
        }
        catch (error) {
            console.error('Error publishing post - Full details:', error);
            if (axios_1.default.isAxiosError(error)) {
                console.error('Axios error response:', error.response?.data);
                console.error('Axios error status:', error.response?.status);
                const errorMessage = error.response?.data?.message || error.message;
                throw new Error(`WordPress API Error: ${errorMessage}`);
            }
            throw new Error(`Failed to publish post: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Prepare post content for WordPress.
     *
     * The DocumentProcessor already produces clean, minimal HTML with:
     *   - citation anchor links to the ΒΙΒΛΙΟΓΡΑΦΙΑ section
     *   - footnote back-reference anchors
     *   - LaTeX delimiters ($...$ / $$...$$) for a WP MathJax/KaTeX plugin
     *
     * No scripts, styles, or duplicate sections are injected here.
     */
    async preparePostContent(content, _client) {
        return content.content;
    }
    /**
     * Upload images to WordPress media library
     */
    async uploadImages(images, postId, client) {
        try {
            // Skip image upload for now - this feature requires FormData polyfill for Node.js
            // or a different approach using multipart/form-data library
            if (images && images.length > 0) {
                console.log(`Skipping upload of ${images.length} images - feature needs implementation`);
                // TODO: Implement image upload using form-data package
            }
        }
        catch (error) {
            console.error('Error uploading images:', error);
            // Don't throw error for images - post should still be created
        }
    }
    /**
     * Get file extension from content type
     */
    getFileExtension(contentType) {
        const extensions = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'image/bmp': 'bmp'
        };
        return extensions[contentType] || 'jpg';
    }
    /**
     * Get WordPress categories
     */
    async getCategories(config) {
        try {
            const client = this.initializeClient(config);
            const response = await client.get('/categories', {
                params: {
                    per_page: 100
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('Error fetching categories:', error);
            return [];
        }
    }
    /**
     * Get WordPress tags
     */
    async getTags(config) {
        try {
            const client = this.initializeClient(config);
            const response = await client.get('/tags', {
                params: {
                    per_page: 100
                }
            });
            return response.data;
        }
        catch (error) {
            console.error('Error fetching tags:', error);
            return [];
        }
    }
    /**
     * Create a new category
     */
    async createCategory(config, name, description) {
        try {
            const client = this.initializeClient(config);
            const response = await client.post('/categories', {
                name,
                description: description || ''
            });
            return response.data;
        }
        catch (error) {
            console.error('Error creating category:', error);
            throw error;
        }
    }
    /**
     * Create a new tag
     */
    async createTag(config, name, description) {
        try {
            const client = this.initializeClient(config);
            const response = await client.post('/tags', {
                name,
                description: description || ''
            });
            return response.data;
        }
        catch (error) {
            console.error('Error creating tag:', error);
            throw error;
        }
    }
}
exports.WordPressService = WordPressService;
//# sourceMappingURL=WordPressService.js.map