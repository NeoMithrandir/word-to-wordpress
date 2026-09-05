import React, { useEffect, useState } from 'react';
import { DeployResult, ProcessedContent, PostSettings, PublishOutcome, SimplificationsResult } from '../App';
import { toLatinSlug } from '../lib/latinSlug';
import {
  API_URL,
  PublishDestination,
  PublishSiteId,
  SiteConnectionState,
  WORDPRESS_SITES,
  resolvePublishSites
} from '../config/wordpress.config';

interface SubjectCategory {
  id: number;
  name: string;
  slug: string;
}

function allowsUnlistedPreview(destination: PublishDestination): boolean {
  switch (destination) {
    case 'arthra':
      return true;
    case 'inscience':
    case 'both':
      return false;
    default: {
      const _exhaustive: never = destination;
      return _exhaustive;
    }
  }
}

interface PublishSettingsProps {
  content: ProcessedContent;
  destination: PublishDestination;
  onDestinationChange: (destination: PublishDestination) => void;
  siteStatuses: Partial<Record<PublishSiteId, SiteConnectionState>>;
  onPublish: (settings: PostSettings) => void;
  onSaveAsHtml?: (settings: PostSettings) => void;
  onBack: () => void;
  isPublishing: boolean;
  publishResult: PublishOutcome | null;
  htmlSaveResult?: any;
  wpConnectionStatus?: 'checking' | 'connected' | 'failed' | null;
  onRetryConnection?: () => void;
}

const DESTINATION_OPTIONS: Array<{
  value: PublishDestination;
  label: string;
  hint: string;
}> = [
  {
    value: 'inscience',
    label: 'inscience.gr',
    hint: 'Legacy WordPress site'
  },
  {
    value: 'arthra',
    label: 'arthra.inscience.gr',
    hint: 'InScience v2 CMS — this is what the Astro frontend reads'
  },
  {
    value: 'both',
    label: 'Both sites',
    hint: 'Create the same post on inscience.gr and arthra.inscience.gr'
  }
];

const STATUS_OPTIONS: Array<{
  value: PostSettings['status'];
  label: string;
  hint: string;
}> = [
  {
    value: 'draft',
    label: 'Draft',
    hint: 'Saved in WordPress but not visible to the public'
  },
  {
    value: 'publish',
    label: 'Published',
    hint: 'Visible to everyone immediately'
  },
  {
    value: 'private',
    label: 'Private',
    hint: 'Only visible to you and editors'
  },
  {
    value: 'unlisted',
    label: 'Unlisted preview',
    hint: 'Published on arthra with a private flag — real inscience.gr URL, hidden from listings'
  }
];

function statusLabel(status: PostSettings['status']): string {
  switch (status) {
    case 'draft':
      return 'Draft';
    case 'publish':
      return 'Published';
    case 'private':
      return 'Private';
    case 'unlisted':
      return 'Unlisted preview';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function publishButtonLabel(status: PostSettings['status'], isPublishing: boolean): string {
  if (isPublishing) return 'Publishing...';
  switch (status) {
    case 'draft':
      return 'Save as Draft';
    case 'publish':
      return 'Publish';
    case 'private':
      return 'Save as Private';
    case 'unlisted':
      return 'Publish Unlisted Preview';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function simplificationsLabel(result: SimplificationsResult): string {
  switch (result.status) {
    case 'running':
      return 'Generating Με πιο απλά Λόγια…';
    case 'ok':
      return result.message || 'Με πιο απλά Λόγια generated';
    case 'failed':
      return result.message || 'Με πιο απλά Λόγια failed';
    case 'skipped':
      return result.message || 'Με πιο απλά Λόγια skipped';
    default: {
      const _exhaustive: never = result.status;
      return _exhaustive;
    }
  }
}

function deployLabel(result: DeployResult): string {
  switch (result.status) {
    case 'running':
      return result.message || 'Rebuilding public site…';
    case 'ok':
      return result.message || 'Public site rebuilt and deployed';
    case 'failed':
      return result.message || 'Public site deploy failed';
    case 'skipped':
      return result.message || 'Public site deploy skipped';
    default: {
      const _exhaustive: never = result.status;
      return _exhaustive;
    }
  }
}

function categoriesLabel(status: 'idle' | 'loading' | 'ok' | 'failed'): string {
  switch (status) {
    case 'idle':
    case 'loading':
      return 'Loading categories…';
    case 'ok':
      return 'Select a subject category';
    case 'failed':
      return 'Could not load categories';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function destinationLabel(value: PublishDestination): string {
  switch (value) {
    case 'inscience':
      return WORDPRESS_SITES.inscience.label;
    case 'arthra':
      return WORDPRESS_SITES.arthra.label;
    case 'both':
      return 'inscience.gr and arthra.inscience.gr';
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

export const PublishSettings: React.FC<PublishSettingsProps> = ({
  content,
  destination,
  onDestinationChange,
  siteStatuses,
  onPublish,
  onSaveAsHtml,
  onBack,
  isPublishing,
  publishResult,
  htmlSaveResult,
  wpConnectionStatus,
  onRetryConnection
}) => {
  const [settings, setSettings] = useState<PostSettings>({
    title: content.title,
    slug: content.slug || toLatinSlug(content.title),
    status: 'draft',
    excerpt: content.excerpt
  });
  const [slugManual, setSlugManual] = useState(
    Boolean(content.slug && content.slug !== toLatinSlug(content.title))
  );
  const [isSavingHtml, setIsSavingHtml] = useState(false);
  const [subjectCategories, setSubjectCategories] = useState<SubjectCategory[]>([]);
  const [categoriesStatus, setCategoriesStatus] = useState<'idle' | 'loading' | 'ok' | 'failed'>('idle');
  const selectedSites = resolvePublishSites(destination);
  const unlistedAllowed = allowsUnlistedPreview(destination);
  const missingSubjectCategory =
    settings.status === 'unlisted' && !(settings.subjectCategoryId && settings.subjectCategoryId > 0);

  useEffect(() => {
    if (settings.status === 'unlisted' && !unlistedAllowed) {
      setSettings((prev) => ({
        ...prev,
        status: 'draft',
        subjectCategoryId: undefined,
        subjectCategorySlug: undefined
      }));
    }
  }, [settings.status, unlistedAllowed]);

  useEffect(() => {
    if (!unlistedAllowed) return;

    let cancelled = false;
    const arthra = WORDPRESS_SITES.arthra;

    const loadCategories = async () => {
      setCategoriesStatus('loading');
      try {
        const response = await fetch(`${API_URL}/api/categories`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            wpConfig: {
              siteUrl: arthra.siteUrl,
              username: arthra.username,
              password: arthra.password
            }
          })
        });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok || !payload.success || !Array.isArray(payload.categories)) {
          setCategoriesStatus('failed');
          return;
        }
        const next: SubjectCategory[] = payload.categories
          .filter((row: { id?: unknown; name?: unknown; slug?: unknown }) => {
            const id = typeof row.id === 'number' ? row.id : Number(row.id);
            return Number.isInteger(id) && id > 0 && row.slug !== 'private';
          })
          .map((row: { id: number; name?: string; slug?: string }) => ({
            id: row.id,
            name: row.name || row.slug || `Category ${row.id}`,
            slug: row.slug || ''
          }));
        setSubjectCategories(next);
        setCategoriesStatus('ok');
      } catch {
        if (!cancelled) setCategoriesStatus('failed');
      }
    };

    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, [unlistedAllowed]);

  const handleInputChange = (field: keyof PostSettings, value: any) => {
    setSettings((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'title' && !slugManual) {
        next.slug = toLatinSlug(String(value ?? ''));
      }
      return next;
    });
  };

  const handleSubjectCategoryChange = (categoryId: string) => {
    const id = Number(categoryId);
    const selected = subjectCategories.find((category) => category.id === id);
    setSettings((prev) => ({
      ...prev,
      subjectCategoryId: selected?.id,
      subjectCategorySlug: selected?.slug
    }));
  };

  const handleSlugChange = (value: string) => {
    if (!value.trim()) {
      setSlugManual(false);
      setSettings((prev) => ({ ...prev, slug: toLatinSlug(prev.title || '') }));
      return;
    }
    setSlugManual(true);
    setSettings((prev) => ({ ...prev, slug: value }));
  };

  const settingsForSubmit = (): PostSettings => ({
    ...settings,
    slug: toLatinSlug(settings.slug || settings.title || content.title)
  });

  const handlePublish = () => {
    onPublish(settingsForSubmit());
  };

  const handleSaveAsHtml = async () => {
    if (onSaveAsHtml) {
      setIsSavingHtml(true);
      try {
        await onSaveAsHtml(settingsForSubmit());
      } finally {
        setIsSavingHtml(false);
      }
    }
  };

  if (publishResult || htmlSaveResult) {
    const results = publishResult?.results ?? [];
    const anySuccess = results.some((entry) => entry.success);
    const anyLocal = results.some((entry) => entry.savedLocally);
    const heading = htmlSaveResult
      ? 'Successfully Saved as HTML!'
      : anySuccess
        ? results.length > 1
          ? 'Publish finished'
          : 'Successfully Published!'
        : anyLocal
          ? 'Post Saved Locally'
          : 'Publish failed';

    return (
      <div className="publish-success">
        <div className="success-icon">{htmlSaveResult ? '📄' : anySuccess ? '🎉' : '⚠️'}</div>
        <h2>{heading}</h2>
        <div className="publish-details">
          {htmlSaveResult ? (
            <>
              <p><strong>File:</strong> {htmlSaveResult.filename}</p>
              <p><strong>Location:</strong> saved-posts folder</p>
              <div className="html-save-note">
                <p>Your post has been saved as a standalone HTML file that can be:</p>
                <ul>
                  <li>Opened directly in any web browser</li>
                  <li>Shared via email or file transfer</li>
                  <li>Uploaded to any web server</li>
                  <li>Used as a backup of your content</li>
                </ul>
              </div>
            </>
          ) : (
            <>
              <p><strong>Status:</strong> {statusLabel(settings.status)}</p>
              {results.map((entry) => (
                <div key={entry.siteId} className="publish-site-result">
                  <p>
                    <strong>{entry.label}</strong>
                    {entry.success ? ' — published' : entry.savedLocally ? ' — saved locally' : ' — failed'}
                  </p>
                  {entry.success && (
                    <>
                      <p><strong>Post ID:</strong> {entry.postId}</p>
                      {entry.shareUrl ? (
                        <p>
                          <strong>Share URL:</strong>{' '}
                          <a href={entry.shareUrl} target="_blank" rel="noopener noreferrer">
                            {entry.shareUrl}
                          </a>
                        </p>
                      ) : (
                        <p><strong>WordPress Site:</strong> {entry.siteUrl}</p>
                      )}
                    </>
                  )}
                  {entry.savedLocally && entry.filename && (
                    <p><strong>Filename:</strong> {entry.filename}</p>
                  )}
                  {entry.simplifications && (
                    <p>
                      <strong>Με πιο απλά Λόγια:</strong>{' '}
                      <span>{simplificationsLabel(entry.simplifications)}</span>
                    </p>
                  )}
                  {entry.deploy && (
                    <p>
                      <strong>Public site:</strong>{' '}
                      <span>{deployLabel(entry.deploy)}</span>
                    </p>
                  )}
                  {entry.error && <p className="connection-error">{entry.error}</p>}
                </div>
              ))}
            </>
          )}
        </div>
        
        <div className="success-actions">
          {results.filter((entry) => entry.shareUrl || entry.postUrl).map((entry) => (
            <a
              key={entry.siteId}
              href={entry.shareUrl || entry.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              {entry.shareUrl ? 'Open shareable preview' : `View on ${entry.label}`}
            </a>
          ))}
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

      {/* WordPress Connection Status */}
      {wpConnectionStatus && (
        <div className={`wp-connection-status ${wpConnectionStatus}`}>
          {wpConnectionStatus === 'checking' && (
            <>
              <span className="status-icon">🔄</span>
              <span>Checking WordPress connection...</span>
            </>
          )}
          {wpConnectionStatus === 'connected' && (
            <>
              <span className="status-icon">✅</span>
              <span>
                Connected to {destinationLabel(destination)} — you can publish or save as HTML
              </span>
            </>
          )}
          {wpConnectionStatus === 'failed' && (
            <>
              <span className="status-icon">⚠️</span>
              <div style={{ flex: 1 }}>
                <strong>WordPress connection unavailable</strong>
                <p>
                  You can still save your document as HTML locally. Publishing requires a working
                  connection to {destinationLabel(destination)}.
                </p>
              </div>
              {onRetryConnection && (
                <button 
                  onClick={onRetryConnection} 
                  className="btn btn-outline btn-small"
                  title="Retry WordPress connection"
                >
                  🔄 Retry
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className="publish-form">
        <div className="form-group">
          <label>Destination</label>
          <div className="destination-options" role="radiogroup" aria-label="Publish destination">
            {DESTINATION_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`destination-option${destination === option.value ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="publish-destination"
                  value={option.value}
                  checked={destination === option.value}
                  onChange={() => onDestinationChange(option.value)}
                  disabled={isPublishing || isSavingHtml}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

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
          <label htmlFor="slug">Permalink slug</label>
          <input
            id="slug"
            type="text"
            value={settings.slug || ''}
            onChange={(e) => handleSlugChange(e.target.value)}
            onBlur={() =>
              setSettings((prev) => ({
                ...prev,
                slug: toLatinSlug(prev.slug || prev.title || '')
              }))
            }
            placeholder="latin-article-slug"
            spellCheck={false}
            autoComplete="off"
          />
          <small>Latin URL slug sent to WordPress on this new post. Clear to regenerate from the title.</small>
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
          <label>Post Status</label>
          <div className="destination-options" role="radiogroup" aria-label="Post status">
            {STATUS_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`destination-option${settings.status === option.value ? ' selected' : ''}`}
              >
                <input
                  type="radio"
                  name="post-status"
                  value={option.value}
                  checked={settings.status === option.value}
                  onChange={() => handleInputChange('status', option.value)}
                  disabled={
                    isPublishing ||
                    isSavingHtml ||
                    (option.value === 'unlisted' && !unlistedAllowed)
                  }
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.hint}</small>
                </span>
              </label>
            ))}
          </div>
          {!unlistedAllowed && (
            <small>Unlisted preview requires destination arthra.inscience.gr.</small>
          )}
        </div>

        {settings.status === 'unlisted' && unlistedAllowed && (
          <div className="form-group">
            <label htmlFor="subject-category">Subject category</label>
            <select
              id="subject-category"
              value={settings.subjectCategoryId ?? ''}
              onChange={(e) => handleSubjectCategoryChange(e.target.value)}
              disabled={isPublishing || isSavingHtml || categoriesStatus !== 'ok'}
            >
              <option value="">
                {categoriesLabel(categoriesStatus)}
              </option>
              {subjectCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <small>
              Required. This is the public URL category (φυσική, βιολογία, …). The
              <code> private </code>
              flag is attached automatically and is not listed here.
            </small>
          </div>
        )}

        <div className="publish-summary">
          <h3>Publishing Summary</h3>
          <div className="summary-grid">
            <div className="summary-item">
              <strong>Status:</strong>
              <span>{statusLabel(settings.status)}</span>
            </div>
            {settings.status === 'unlisted' && (
              <div className="summary-item">
                <strong>Subject category:</strong>
                <span>
                  {subjectCategories.find((category) => category.id === settings.subjectCategoryId)?.name
                    || 'Not selected'}
                </span>
              </div>
            )}
            <div className="summary-item">
              <strong>Slug:</strong>
              <span>{settings.slug || toLatinSlug(settings.title || content.title)}</span>
            </div>
            <div className="summary-item">
              <strong>Destination:</strong>
              <span>
                {destinationLabel(destination)}
                {wpConnectionStatus === 'failed' && <span className="connection-error"> (Offline)</span>}
              </span>
            </div>
            {selectedSites.map((site) => (
              <div key={site.id} className="summary-item">
                <strong>{site.label}:</strong>
                <span>
                  {siteStatuses[site.id] === 'connected' && 'Connected'}
                  {siteStatuses[site.id] === 'checking' && 'Checking…'}
                  {siteStatuses[site.id] === 'failed' && 'Unavailable'}
                  {!siteStatuses[site.id] && 'Not checked'}
                </span>
              </div>
            ))}
            <div className="summary-item">
              <strong>Author:</strong>
              <span>{selectedSites[0]?.username}</span>
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
            <p>Publishing your post to {destinationLabel(destination)}...</p>
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
          disabled={isPublishing || isSavingHtml}
        >
          ← Back to Preview
        </button>
        <div className="publish-buttons">
          {onSaveAsHtml && (
            <button 
              onClick={handleSaveAsHtml}
              className="btn btn-secondary"
              disabled={isPublishing || isSavingHtml || !settings.title}
              title="Save as HTML file locally"
            >
              {isSavingHtml ? 'Saving...' : '💾 Save as HTML'}
            </button>
          )}
          <button 
            onClick={handlePublish}
            className="btn btn-primary"
            disabled={
              isPublishing ||
              isSavingHtml ||
              !settings.title ||
              wpConnectionStatus === 'failed' ||
              (settings.status === 'unlisted' && (missingSubjectCategory || !unlistedAllowed))
            }
            title={
              wpConnectionStatus === 'failed'
                ? 'WordPress connection unavailable'
                : settings.status === 'unlisted' && missingSubjectCategory
                  ? 'Pick a subject category for the public URL'
                  : ''
            }
          >
            {publishButtonLabel(settings.status, isPublishing)}
          </button>
        </div>
      </div>

      <div className="publish-info">
        <h4>ℹ️ What happens when you publish?</h4>
        <ul>
          <li>Your document content will be converted to WordPress-compatible HTML</li>
          <li>The permalink slug will be Latin (ASCII), generated from the title unless you override it</li>
          <li>Images will be uploaded to your WordPress media library</li>
          <li>Footnotes will be preserved with working internal links</li>
          <li>Citations and references will be properly formatted</li>
          <li>All formatting (headings, lists, bold, italic) will be maintained</li>
          {destination === 'both' && (
            <li><strong>Both sites:</strong> the same post is created separately on each WordPress instance</li>
          )}
          {settings.status === 'draft' && <li><strong>As a draft:</strong> Only you can see it until you publish</li>}
          {settings.status === 'publish' && <li><strong>When published:</strong> It will be immediately visible to your audience</li>}
          {settings.status === 'private' && <li><strong>As private:</strong> Only you and editors can see it</li>}
          {settings.status === 'unlisted' && (
            <li>
              <strong>As an unlisted preview:</strong> WordPress status is published, the
              <code> private </code>
              category is attached, and the live site rebuilds. The success screen shows
              the public inscience.gr category/slug URL — it stays off homepage, archives,
              and search.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};
