import React, { useState } from 'react';
import './App.css';
import { DocumentUpload } from './components/DocumentUpload';
import { ContentPreview } from './components/ContentPreview';
import { PublishSettings } from './components/PublishSettings';
import { WORDPRESS_CONFIG, API_URL } from './config/wordpress.config';

export interface ProcessedContent {
  title: string;
  content: string;
  excerpt: string;
  footnotes: Footnote[];
  citations: Citation[];
  images: ProcessedImage[];
  equations: Equation[];
  wordCount: number;
  documentType?: 'word' | 'pdf';
}

export interface Footnote {
  id: string;
  text: string;
  backRef: string;
}

export interface Citation {
  id: string;
  text: string;
  source: string;
}

export interface ProcessedImage {
  id: string;
  alt: string;
  title: string;
  data: string;
  contentType: string;
}

export interface Equation {
  id: string;
  latex: string;
  display: boolean;
  number?: string;
}

export interface WPConfig {
  siteUrl: string;
  username: string;
  password: string;
}

export interface PostSettings {
  title?: string;
  status: 'draft' | 'publish' | 'private';
  categories?: number[];
  tags?: number[];
  excerpt?: string;
}

function App() {
  const [step, setStep] = useState<'upload' | 'preview' | 'publish'>('upload');
  const [processedContent, setProcessedContent] = useState<ProcessedContent | null>(null);
  const [postSettings, setPostSettings] = useState<PostSettings>({
    status: 'draft'
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<any>(null);
  const [htmlSaveResult, setHtmlSaveResult] = useState<any>(null);
  const [wpConnectionStatus, setWpConnectionStatus] = useState<'checking' | 'connected' | 'failed' | null>(null);

  const checkWordPressConnection = async () => {
    setWpConnectionStatus('checking');
    try {
      const response = await fetch(`${API_URL}/api/test-connection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wpConfig: WORDPRESS_CONFIG
        }),
      });
      
      const result = await response.json();
      if (result.connected) {
        setWpConnectionStatus('connected');
      } else {
        setWpConnectionStatus('failed');
      }
    } catch (error) {
      console.error('WordPress connection check failed:', error);
      setWpConnectionStatus('failed');
    }
  };

  const handleDocumentProcessed = (content: ProcessedContent) => {
    setProcessedContent(content);
    setStep('preview');
    // Check WordPress connection in the background (non-blocking)
    checkWordPressConnection();
  };

  const handlePreviewConfirmed = () => {
    setStep('publish');
  };

  const handlePublish = async (settings: PostSettings) => {
    if (!processedContent) return;

    setIsPublishing(true);
    // Store settings for later use
    setPostSettings(settings);

    try {
      const response = await fetch(`${API_URL}/api/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: processedContent,
          wpConfig: WORDPRESS_CONFIG,
          postData: settings
        }),
      });

      if (!response.ok) {
        console.error('Response not OK:', response.status, response.statusText);
      }

      const result = await response.json();
      console.log('Publish response:', result);
      
      if (result.success) {
        setPublishResult(result);
      } else if (result.savedLocally) {
        // Post saved locally due to permission issues
        alert(`📁 ${result.message}\n\nThe post has been saved locally because of WordPress permission issues.`);
        setPublishResult({
          savedLocally: true,
          filename: result.filename,
          message: result.message
        });
      } else {
        // Handle error object from backend
        let errorMessage = 'Failed to publish';
        if (result.error) {
          if (typeof result.error === 'string') {
            errorMessage = result.error;
          } else if (typeof result.error === 'object' && result.error.message) {
            errorMessage = result.error.message;
          }
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Publishing error:', error);
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      alert(`Error publishing post: ${errorMessage}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveAsHtml = async (settings: PostSettings) => {
    if (!processedContent) return;

    try {
      const response = await fetch(`${API_URL}/api/save-html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: processedContent,
          postData: settings
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setHtmlSaveResult(result);
        alert(`✅ ${result.message}\n\nFile saved in: saved-posts/${result.filename}`);
      } else {
        throw new Error(result.error || 'Failed to save as HTML');
      }
    } catch (error) {
      console.error('HTML save error:', error);
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      alert(`Error saving as HTML: ${errorMessage}`);
    }
  };

  const resetApp = () => {
    setStep('upload');
    setProcessedContent(null);
    setPostSettings({ status: 'draft' });
    setPublishResult(null);
    setHtmlSaveResult(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Word to WordPress Converter</h1>
        <p>Convert Word documents to WordPress posts while maintaining formatting, footnotes, and citations</p>
      </header>

      <main className="App-main">
              <div className="step-indicator">
        <div className={`step ${step === 'upload' ? 'active' : ''} ${processedContent ? 'completed' : ''}`}>
          1. Upload Document
        </div>
        <div className={`step ${step === 'preview' ? 'active' : ''}`}>
          2. Preview Content
        </div>
        <div className={`step ${step === 'publish' ? 'active' : ''} ${publishResult ? 'completed' : ''}`}>
          3. Publish
        </div>
      </div>

        {step === 'upload' && (
          <DocumentUpload onDocumentProcessed={handleDocumentProcessed} />
        )}

        {step === 'preview' && processedContent && (
          <ContentPreview 
            content={processedContent}
            onConfirm={handlePreviewConfirmed}
            onBack={() => setStep('upload')}
          />
        )}

        {step === 'publish' && processedContent && (
          <PublishSettings
            content={processedContent}
            wpConfig={WORDPRESS_CONFIG}
            onPublish={handlePublish}
            onSaveAsHtml={handleSaveAsHtml}
            onBack={() => setStep('preview')}
            isPublishing={isPublishing}
            publishResult={publishResult}
            htmlSaveResult={htmlSaveResult}
            wpConnectionStatus={wpConnectionStatus}
            onRetryConnection={checkWordPressConnection}
          />
        )}

        {publishResult && (
          <div className="publish-success">
            {publishResult.savedLocally ? (
              <>
                <h2>📁 Post Saved Locally</h2>
                <p className="warning-message">
                  Due to WordPress permission issues, your post has been saved locally.
                </p>
                <p><strong>Filename:</strong> {publishResult.filename}</p>
                <p className="help-text">
                  To publish this post later:
                  <br />1. Get proper WordPress permissions (Author role or higher)
                  <br />2. Update credentials in config/wordpress.config.ts
                  <br />3. The saved post can be found in the saved-posts folder
                </p>
              </>
            ) : (
              <>
                <h2>✅ Post Published Successfully!</h2>
                <p>Post ID: {publishResult.postId}</p>
                <a href={publishResult.postUrl} target="_blank" rel="noopener noreferrer">
                  View Post
                </a>
              </>
            )}
            <button onClick={resetApp} className="btn btn-primary">
              Convert Another Document
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
