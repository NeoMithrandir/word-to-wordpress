import fs from 'fs';
import path from 'path';
import { ProcessedContent } from './DocumentProcessor';
import { PostData } from './WordPressService';

export class LocalSaveService {
  private saveDirectory: string;

  constructor() {
    this.saveDirectory = path.join(process.cwd(), 'saved-posts');
    this.ensureSaveDirectory();
  }

  /**
   * Ensure the save directory exists
   */
  private ensureSaveDirectory(): void {
    if (!fs.existsSync(this.saveDirectory)) {
      fs.mkdirSync(this.saveDirectory, { recursive: true });
      console.log('Created saved-posts directory');
    }
  }

  /**
   * Save post data locally as JSON
   */
  async savePost(content: ProcessedContent, postData: PostData): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `post-${timestamp}.json`;
      const filepath = path.join(this.saveDirectory, filename);

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

      fs.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
      console.log(`Post saved locally: ${filename}`);

      return filename;
    } catch (error) {
      console.error('Error saving post locally:', error);
      throw new Error('Failed to save post locally');
    }
  }

  /**
   * List all saved posts
   */
  async listSavedPosts(): Promise<string[]> {
    try {
      const files = fs.readdirSync(this.saveDirectory);
      return files.filter(file => file.endsWith('.json'));
    } catch (error) {
      console.error('Error listing saved posts:', error);
      return [];
    }
  }

  /**
   * Load a saved post
   */
  async loadPost(filename: string): Promise<any> {
    try {
      const filepath = path.join(this.saveDirectory, filename);
      const data = fs.readFileSync(filepath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading saved post:', error);
      throw new Error('Failed to load saved post');
    }
  }
} 