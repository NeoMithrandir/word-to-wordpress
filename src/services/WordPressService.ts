import axios, { AxiosInstance } from 'axios';
import { ProcessedContent } from './DocumentProcessor';

export interface WordPressConfig {
  siteUrl: string;
  username: string;
  password: string; // Application password
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
  title: { rendered: string };
  content: { rendered: string };
  link: string;
  status: string;
  date: string;
  modified: string;
}

export class WordPressService {
  private apiClient: AxiosInstance | null = null;

  /**
   * Initialize WordPress API client
   */
  private initializeClient(config: WordPressConfig): AxiosInstance {
    const baseURL = `${config.siteUrl.replace(/\/$/, '')}/wp-json/wp/v2`;
    
    return axios.create({
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
  async testConnection(config: WordPressConfig): Promise<boolean> {
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
    } catch (error) {
      console.error('WordPress connection test failed:', error);
      return false;
    }
  }

  /**
   * Publish content to WordPress
   */
  async publishPost(
    content: ProcessedContent, 
    config: WordPressConfig, 
    postData: PostData
  ): Promise<WordPressPost> {
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
    } catch (error) {
      console.error('Error publishing post - Full details:', error);
      
      if (axios.isAxiosError(error)) {
        console.error('Axios error response:', error.response?.data);
        console.error('Axios error status:', error.response?.status);
        const errorMessage = error.response?.data?.message || error.message;
        throw new Error(`WordPress API Error: ${errorMessage}`);
      }
      
      throw new Error(`Failed to publish post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Prepare post content with WordPress-specific formatting
   */
  private async preparePostContent(content: ProcessedContent, client: AxiosInstance): Promise<string> {
    let processedContent = content.content;
    
    // Add MathJax support if equations are present
    if (content.equations && content.equations.length > 0) {
      const mathJaxScript = `
        <script type="text/javascript" async
          src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
        <script type="text/javascript" id="MathJax-script" async
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        <script type="text/javascript">
          window.MathJax = {
            tex: {
              inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
              displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
              processEscapes: true,
              processEnvironments: true
            },
            options: {
              ignoreHtmlClass: 'tex2jax_ignore',
              processHtmlClass: 'tex2jax_process'
            }
          };
        </script>
      `;
      
      // Add MathJax script to the beginning of the content
      processedContent = mathJaxScript + '\n\n' + processedContent;
      
      // Add equation-specific CSS
      const equationCSS = `
        <style>
          .equation-display, .math-display {
            text-align: center;
            margin: 1em 0;
            padding: 1em;
            background-color: #f8f9fa;
            border-radius: 4px;
            overflow-x: auto;
          }
          .equation-display-numbered {
            display: flex;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            margin: 1em 0;
            padding: 1em;
            background-color: #f8f9fa;
            border-radius: 4px;
            overflow-x: auto;
          }
          .equation-content {
            flex: 1;
          }
          .equation-number {
            margin-left: 1em;
            font-weight: bold;
            color: #666;
          }
          .equation-inline, .math-inline {
            font-style: italic;
          }
          .wp-block-equation-display, .wp-block-math-display {
            margin: 1.5em 0;
          }
          .wp-block-equation-inline, .wp-block-math-inline {
            display: inline;
          }
        </style>
      `;
      
      processedContent = equationCSS + '\n\n' + processedContent;
    }
    
    // Add footnotes section if present
    if (content.footnotes && content.footnotes.length > 0) {
      processedContent += '\n\n<div class="footnotes">\n<h3>Footnotes</h3>\n';
      
      for (const footnote of content.footnotes) {
        processedContent += `<div id="${footnote.id}" class="footnote">`;
        processedContent += `<p>${footnote.text} <a href="#${footnote.backRef}" class="footnote-backref">↩</a></p>`;
        processedContent += '</div>\n';
      }
      
      processedContent += '</div>\n';
    }
    
    // Add citations section if present
    if (content.citations && content.citations.length > 0) {
      processedContent += '\n\n<div class="citations">\n<h3>References</h3>\n';
      
      for (const citation of content.citations) {
        processedContent += `<div id="${citation.id}" class="citation">`;
        processedContent += `<p>${citation.text}</p>`;
        processedContent += '</div>\n';
      }
      
      processedContent += '</div>\n';
    }
    
    // Add equations section if present (for reference)
    if (content.equations && content.equations.length > 0) {
      processedContent += '\n\n<div class="equations-reference">\n<h3>Equations Reference</h3>\n';
      
      for (const equation of content.equations) {
        processedContent += `<div id="ref-${equation.id}" class="equation-reference">`;
        processedContent += `<p><strong>${equation.display ? 'Display' : 'Inline'} Equation`;
        if (equation.number) {
          processedContent += ` (${equation.number})`;
        }
        processedContent += ':</strong></p>';
        processedContent += `<div class="equation-latex-code"><code>${equation.latex}</code></div>`;
        processedContent += '</div>\n';
      }
      
      processedContent += '</div>\n';
    }
    
    return processedContent;
  }

  /**
   * Upload images to WordPress media library
   */
  private async uploadImages(
    images: any[], 
    postId: number, 
    client: AxiosInstance
  ): Promise<void> {
    try {
      // Skip image upload for now - this feature requires FormData polyfill for Node.js
      // or a different approach using multipart/form-data library
      if (images && images.length > 0) {
        console.log(`Skipping upload of ${images.length} images - feature needs implementation`);
        // TODO: Implement image upload using form-data package
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      // Don't throw error for images - post should still be created
    }
  }

  /**
   * Get file extension from content type
   */
  private getFileExtension(contentType: string): string {
    const extensions: { [key: string]: string } = {
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
  async getCategories(config: WordPressConfig): Promise<any[]> {
    try {
      const client = this.initializeClient(config);
      const response = await client.get('/categories', {
        params: {
          per_page: 100
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching categories:', error);
      return [];
    }
  }

  /**
   * Get WordPress tags
   */
  async getTags(config: WordPressConfig): Promise<any[]> {
    try {
      const client = this.initializeClient(config);
      const response = await client.get('/tags', {
        params: {
          per_page: 100
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error fetching tags:', error);
      return [];
    }
  }

  /**
   * Create a new category
   */
  async createCategory(config: WordPressConfig, name: string, description?: string): Promise<any> {
    try {
      const client = this.initializeClient(config);
      const response = await client.post('/categories', {
        name,
        description: description || ''
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating category:', error);
      throw error;
    }
  }

  /**
   * Create a new tag
   */
  async createTag(config: WordPressConfig, name: string, description?: string): Promise<any> {
    try {
      const client = this.initializeClient(config);
      const response = await client.post('/tags', {
        name,
        description: description || ''
      });
      
      return response.data;
    } catch (error) {
      console.error('Error creating tag:', error);
      throw error;
    }
  }
} 