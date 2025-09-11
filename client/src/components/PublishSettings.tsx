import React, { useState } from 'react';
import { ProcessedContent, WPConfig, PostSettings } from '../App';

interface PublishSettingsProps {
  content: ProcessedContent;
  wpConfig: WPConfig;
  onPublish: (settings: PostSettings) => void;
  onBack: () => void;
  isPublishing: boolean;
  publishResult: any;
}

export const PublishSettings: React.FC<PublishSettingsProps> = ({
  content,
  wpConfig,
  onPublish,
  onBack,
  isPublishing,
  publishResult
}) => {
  const [settings, setSettings] = useState<PostSettings>({
    title: content.title,
    status: 'draft',
    excerpt: content.excerpt
  });

  const handleInputChange = (field: keyof PostSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handlePublish = () => {
    onPublish(settings);
  };

  if (publishResult) {
    return (
      <div className="publish-success">
        <div className="success-icon">🎉</div>
        <h2>Successfully Published!</h2>
        <div className="publish-details">
          <p><strong>Post ID:</strong> {publishResult.postId}</p>
          <p><strong>Status:</strong> {settings.status}</p>
          <p><strong>WordPress Site:</strong> {wpConfig.siteUrl}</p>
        </div>
        
        <div className="success-actions">
          <a 
            href={publishResult.postUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            View Post in WordPress
          </a>
          <button onClick={() => window.location.reload()} className="btn btn-outline">
            Convert Another Document
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="publish-settings">
      <h2>Publish Settings</h2>
      <p>Configure how your post will be published to WordPress.</p>

      <div className="publish-form">
        <div className="form-group">
          <label htmlFor="title">Post Title</label>
          <input
            id="title"
            type="text"
            value={settings.title || ''}
            onChange={(e) => handleInputChange('title', e.target.value)}
            placeholder="Enter post title..."
          />
        </div>

        <div className="form-group">
          <label htmlFor="excerpt">Excerpt</label>
          <textarea
            id="excerpt"
            value={settings.excerpt || ''}
            onChange={(e) => handleInputChange('excerpt', e.target.value)}
            placeholder="Enter post excerpt..."
            rows={3}
          />
          <small>A brief summary of your post (optional)</small>
        </div>

        <div className="form-group">
          <label htmlFor="status">Post Status</label>
          <select
            id="status"
            value={settings.status}
            onChange={(e) => handleInputChange('status', e.target.value as 'draft' | 'publish' | 'private')}
          >
            <option value="draft">Draft</option>
            <option value="publish">Publish</option>
            <option value="private">Private</option>
          </select>
          <small>
            {settings.status === 'draft' && 'Save as draft - you can publish later'}
            {settings.status === 'publish' && 'Publish immediately - will be visible to all'}
            {settings.status === 'private' && 'Private - only visible to you and editors'}
          </small>
        </div>

        <div className="publish-summary">
          <h3>Publishing Summary</h3>
          <div className="summary-grid">
            <div className="summary-item">
              <strong>Destination:</strong>
              <span>{wpConfig.siteUrl}</span>
            </div>
            <div className="summary-item">
              <strong>Author:</strong>
              <span>{wpConfig.username}</span>
            </div>
            <div className="summary-item">
              <strong>Word Count:</strong>
              <span>{content.wordCount} words</span>
            </div>
            <div className="summary-item">
              <strong>Footnotes:</strong>
              <span>{content.footnotes.length}</span>
            </div>
            <div className="summary-item">
              <strong>Citations:</strong>
              <span>{content.citations.length}</span>
            </div>
            <div className="summary-item">
              <strong>Images:</strong>
              <span>{content.images.length}</span>
            </div>
          </div>
        </div>

        {isPublishing && (
          <div className="publishing-status">
            <div className="spinner"></div>
            <p>Publishing your post to WordPress...</p>
            <div className="publishing-steps">
              <div className="step completed">✓ Processing content</div>
              <div className="step active">🔄 Uploading to WordPress</div>
              <div className="step">📸 Uploading images</div>
              <div className="step">🔗 Creating footnote links</div>
            </div>
          </div>
        )}
      </div>

      <div className="publish-actions">
        <button 
          onClick={onBack} 
          className="btn btn-outline"
          disabled={isPublishing}
        >
          ← Back to Preview
        </button>
        <button 
          onClick={handlePublish}
          className="btn btn-primary"
          disabled={isPublishing || !settings.title}
        >
          {isPublishing ? 'Publishing...' : `${settings.status === 'publish' ? 'Publish' : 'Save as Draft'}`}
        </button>
      </div>

      <div className="publish-info">
        <h4>ℹ️ What happens when you publish?</h4>
        <ul>
          <li>Your document content will be converted to WordPress-compatible HTML</li>
          <li>Images will be uploaded to your WordPress media library</li>
          <li>Footnotes will be preserved with working internal links</li>
          <li>Citations and references will be properly formatted</li>
          <li>All formatting (headings, lists, bold, italic) will be maintained</li>
          {settings.status === 'draft' && <li><strong>As a draft:</strong> Only you can see it until you publish</li>}
          {settings.status === 'publish' && <li><strong>When published:</strong> It will be immediately visible to your audience</li>}
        </ul>
      </div>
    </div>
  );
}; 