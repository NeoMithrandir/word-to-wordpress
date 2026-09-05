import React, { useState } from 'react';
import './App.css';
import { DocumentUpload } from './components/DocumentUpload';
import { ContentPreview } from './components/ContentPreview';
import { PublishSettings } from './components/PublishSettings';
import { PostFetcher } from './components/PostFetcher';
import { LivePublishLog } from './components/LivePublishLog';
import {
  API_URL,
  PublishDestination,
  PublishSiteId,
  SiteConnectionState,
  overallConnectionStatus,
  publicArticleUrl,
  resolvePublishSites
} from './config/wordpress.config';
import { stripImageDataUris } from './lib/reviewHtml';

export interface ProcessedContent {
  title: string;
  content: string;
  excerpt: string;
  /** Latin permalink slug; generated from the title in preview, user can override. */
  slug?: string;
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

export type ImageSeoSource = 'alt' | 'caption' | 'heading' | 'title' | 'ai';

export interface ProcessedImage {
  id: string;
  filename?: string;
  alt: string;
  title: string;
  caption?: string;
  seoSource?: ImageSeoSource;
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

export type PublishUiStatus = 'draft' | 'publish' | 'private' | 'unlisted';

export interface PostSettings {
  title?: string;
  slug?: string;
  status: PublishUiStatus;
  /** Required for Unlisted preview: arthra subject category (not `private`). */
  subjectCategoryId?: number;
  subjectCategorySlug?: string;
  categories?: number[];
  tags?: number[];
  excerpt?: string;
}

export type SimplificationsStatus = 'skipped' | 'running' | 'ok' | 'failed';

export interface SimplificationsResult {
  status: SimplificationsStatus;
  message?: string;
}

export type DeployStatus = SimplificationsStatus;

export interface DeployResult {
  status: DeployStatus;
  message?: string;
}

export interface SitePublishResult {
  siteId: PublishSiteId;
  label: string;
  siteUrl: string;
  success: boolean;
  postId?: number;
  postUrl?: string;
  /** Public inscience.gr article URL for Unlisted preview (not the arthra permalink). */
  shareUrl?: string;
  slug?: string;
  savedLocally?: boolean;
  filename?: string;
  error?: string;
  simplifications?: SimplificationsResult;
  deploy?: DeployResult;
}

export interface PublishOutcome {
  results: SitePublishResult[];
}

type AppPage = 'convert' | 'fetch-posts' | 'live-publish';

/** Editable fields only — image binaries stay on the server. Body HTML uses [image:id] placeholders. */
function toPublishOverlay(content: ProcessedContent) {
  return {
    title: content.title,
    excerpt: content.excerpt,
    content: stripImageDataUris(content.content, content.images),
    footnotes: content.footnotes,
    citations: content.citations,
    equations: content.equations,
    wordCount: content.wordCount,
    images: content.images.map((img) => ({
      id: img.id,
      filename: img.filename || img.id,
      alt: img.alt,
      title: img.title,
      caption: img.caption,
      seoSource: img.seoSource,
      contentType: img.contentType
    }))
  };
}

function livePublishHttpError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return undefined;
}

function App() {
  const [page, setPage] = useState<AppPage>('convert');
  const [step, setStep] = useState<'upload' | 'preview' | 'publish'>('upload');
  const [processedContent, setProcessedContent] = useState<ProcessedContent | null>(null);
  const [contentId, setContentId] = useState<string | null>(null);
  const [postSettings, setPostSettings] = useState<PostSettings>({
    status: 'draft'
  });
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishOutcome | null>(null);
  const [htmlSaveResult, setHtmlSaveResult] = useState<any>(null);
  const [destination, setDestination] = useState<PublishDestination>('arthra');
  const [siteStatuses, setSiteStatuses] = useState<Partial<Record<PublishSiteId, SiteConnectionState>>>({});

  const wpConnectionStatus = overallConnectionStatus(destination, siteStatuses);

  const checkWordPressConnection = async (dest: PublishDestination = destination) => {
    const sites = resolvePublishSites(dest);
    setSiteStatuses((prev) => {
      const next = { ...prev };
      for (const site of sites) {
        next[site.id] = 'checking';
      }
      return next;
    });

    await Promise.all(
      sites.map(async (site) => {
        try {
          const response = await fetch(`${API_URL}/api/test-connection`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              wpConfig: {
                siteUrl: site.siteUrl,
                username: site.username,
                password: site.password
              }
            }),
          });

          const result = await response.json();
          setSiteStatuses((prev) => ({
            ...prev,
            [site.id]: result.connected ? 'connected' : 'failed'
          }));
        } catch (error) {
          console.error(`WordPress connection check failed for ${site.siteUrl}:`, error);
          setSiteStatuses((prev) => ({ ...prev, [site.id]: 'failed' }));
        }
      })
    );
  };

  const handleDestinationChange = (next: PublishDestination) => {
    setDestination(next);
    void checkWordPressConnection(next);
  };

  const handleDocumentProcessed = (content: ProcessedContent, uploadedContentId: string) => {
    setProcessedContent(content);
    setContentId(uploadedContentId);
    setStep('preview');
    // Check WordPress connection in the background (non-blocking)
    checkWordPressConnection();
  };

  const handlePreviewConfirmed = () => {
    setStep('publish');
  };

  const handleContentUpdate = (updated: ProcessedContent) => {
    setProcessedContent(updated);
  };

  const handlePublish = async (settings: PostSettings) => {
    if (!processedContent) return;
    if (!contentId) {
      alert('Processed document is missing from the server cache. Please re-upload the document.');
      return;
    }

    setIsPublishing(true);
    setPostSettings(settings);

    const sites = resolvePublishSites(destination);
    const results: SitePublishResult[] = [];
    const contentOverlay = toPublishOverlay(processedContent);

    for (const site of sites) {
      try {
        const response = await fetch(`${API_URL}/api/publish`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contentId,
            content: contentOverlay,
            wpConfig: {
              siteUrl: site.siteUrl,
              username: site.username,
              password: site.password
            },
            postData: settings
          }),
        });

        if (!response.ok) {
          console.error('Response not OK:', response.status, response.statusText);
        }

        const result = await response.json();
        console.log(`Publish response for ${site.siteUrl}:`, result);

        if (result.success) {
          const shareUrl =
            settings.status === 'unlisted' &&
            site.id === 'arthra' &&
            settings.subjectCategorySlug &&
            result.slug
              ? publicArticleUrl(settings.subjectCategorySlug, result.slug)
              : undefined;
          results.push({
            siteId: site.id,
            label: site.label,
            siteUrl: site.siteUrl,
            success: true,
            postId: result.postId,
            postUrl: result.postUrl,
            shareUrl,
            slug: result.slug
          });
          continue;
        }

        let errorMessage = 'Failed to publish';
        if (result.error) {
          if (typeof result.error === 'string') {
            errorMessage = result.error;
          } else if (typeof result.error === 'object' && result.error.message) {
            errorMessage = result.error.message;
          }
        }

        if (result.savedLocally) {
          results.push({
            siteId: site.id,
            label: site.label,
            siteUrl: site.siteUrl,
            success: false,
            savedLocally: true,
            filename: result.filename,
            error: result.message || errorMessage
          });
          continue;
        }

        results.push({
          siteId: site.id,
          label: site.label,
          siteUrl: site.siteUrl,
          success: false,
          error: errorMessage
        });
      } catch (error) {
        console.error(`Publishing error for ${site.siteUrl}:`, error);
        results.push({
          siteId: site.id,
          label: site.label,
          siteUrl: site.siteUrl,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    setPublishResult({ results });

    const failed = results.filter((entry) => !entry.success && !entry.savedLocally);
    if (failed.length === results.length && failed.length > 0) {
      alert(`Error publishing post: ${failed.map((entry) => `${entry.label}: ${entry.error}`).join('\n')}`);
    } else if (failed.length > 0) {
      alert(`Published with errors:\n${failed.map((entry) => `${entry.label}: ${entry.error}`).join('\n')}`);
    }

    setIsPublishing(false);
    await runLivePipelineAfterArthraPublish(settings.status, results);
  };

  const applyArthraPipeline = (
    siteId: PublishSiteId,
    update: { simplifications?: SimplificationsResult; deploy?: DeployResult }
  ) => {
    setPublishResult((prev) => {
      if (!prev) return prev;
      return {
        results: prev.results.map((entry) =>
          entry.siteId === siteId ? { ...entry, ...update } : entry
        )
      };
    });
  };

  const runLivePipelineAfterArthraPublish = async (
    status: PostSettings['status'],
    results: SitePublishResult[]
  ) => {
    const arthraResult = results.find((entry) => entry.siteId === 'arthra' && entry.success);
    if (!arthraResult) return;

    switch (status) {
      case 'publish':
      case 'unlisted':
        break;
      case 'draft':
      case 'private': {
        const skipped = {
          status: 'skipped' as const,
          message: 'Live pipeline runs only after a public arthra publish — drafts and WordPress-private posts stay off the public site.'
        };
        applyArthraPipeline(arthraResult.siteId, { simplifications: skipped, deploy: skipped });
        return;
      }
      default: {
        const _exhaustive: never = status;
        return _exhaustive;
      }
    }

    const slug = arthraResult.slug || arthraResult.postUrl || '';
    if (!slug) {
      const failed = {
        status: 'failed' as const,
        message: 'WordPress did not return a post slug.'
      };
      applyArthraPipeline(arthraResult.siteId, { simplifications: failed, deploy: failed });
      return;
    }

    applyArthraPipeline(arthraResult.siteId, {
      simplifications: { status: 'running' },
      deploy: { status: 'running', message: 'Waiting for Με πιο απλά Λόγια, then rebuild…' }
    });

    try {
      const response = await fetch(`${API_URL}/api/live-publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          slug,
          title: processedContent?.title,
          postId: arthraResult.postId,
          postUrl: arthraResult.postUrl,
          publishedAt: new Date().toISOString(),
          source: 'publish'
        }),
      });
      const payload = await response.json();
      const httpError = livePublishHttpError(payload);
      applyArthraPipeline(arthraResult.siteId, {
        simplifications: {
          status: payload.simplifications?.ok ? 'ok' : 'failed',
          message:
            payload.simplifications?.message ||
            payload.simplifications?.output ||
            httpError ||
            (payload.simplifications?.ok ? undefined : 'generate:simplifications failed')
        },
        deploy: {
          status: payload.deploy?.ok ? 'ok' : 'failed',
          message:
            payload.deploy?.message ||
            payload.deploy?.output ||
            (payload.simplifications ? undefined : httpError) ||
            (payload.deploy?.ok ? undefined : 'inscience-v2 deploy failed')
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start the live-publish pipeline';
      applyArthraPipeline(arthraResult.siteId, {
        simplifications: { status: 'failed', message },
        deploy: { status: 'failed', message }
      });
    }
  };

  const handleSaveAsHtml = async (settings: PostSettings) => {
    if (!processedContent) return;
    if (!contentId) {
      alert('Processed document is missing from the server cache. Please re-upload the document.');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/save-html`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentId,
          content: toPublishOverlay(processedContent),
          postData: settings
        }),
      });

      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        const message =
          failure?.error?.message || failure?.error || `Failed to save: ${response.statusText}`;
        throw new Error(typeof message === 'string' ? message : 'Failed to save as HTML');
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
    setContentId(null);
    setPostSettings({ status: 'draft' });
    setPublishResult(null);
    setHtmlSaveResult(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Word to WordPress</h1>
        <p>Convert documents &amp; manage WordPress posts</p>
        <nav className="app-nav">
          <button
            className={`nav-btn ${page === 'convert' ? 'active' : ''}`}
            onClick={() => setPage('convert')}
          >
            Convert Document
          </button>
          <button
            className={`nav-btn ${page === 'fetch-posts' ? 'active' : ''}`}
            onClick={() => setPage('fetch-posts')}
          >
            Fetch &amp; Export Posts
          </button>
          <button
            className={`nav-btn ${page === 'live-publish' ? 'active' : ''}`}
            onClick={() => setPage('live-publish')}
          >
            Live Publish
          </button>
        </nav>
      </header>

      <main className="App-main">
        {page === 'convert' && (
          <>
            <div className="step-indicator">
              <div className={`step ${step === 'upload' ? 'active' : ''} ${processedContent ? 'completed' : ''}`}>
                1. Upload Document
              </div>
              <div className={`step ${step === 'preview' ? 'active' : ''}`}>
                2. Preview &amp; Edit
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
                contentId={contentId}
                onConfirm={handlePreviewConfirmed}
                onUpdate={handleContentUpdate}
                onBack={() => setStep('upload')}
              />
            )}

            {step === 'publish' && processedContent && (
              <PublishSettings
                content={processedContent}
                destination={destination}
                onDestinationChange={handleDestinationChange}
                siteStatuses={siteStatuses}
                onPublish={handlePublish}
                onSaveAsHtml={handleSaveAsHtml}
                onBack={() => setStep('preview')}
                isPublishing={isPublishing}
                publishResult={publishResult}
                htmlSaveResult={htmlSaveResult}
                wpConnectionStatus={wpConnectionStatus}
                onRetryConnection={() => checkWordPressConnection(destination)}
              />
            )}
          </>
        )}

        {page === 'fetch-posts' && <PostFetcher />}
        {page === 'live-publish' && <LivePublishLog />}
      </main>
    </div>
  );
}

export default App;
