import React, { useEffect, useRef, useState } from 'react';
import {
  Citation,
  Footnote,
  ImageSeoSource,
  ProcessedContent,
  ProcessedImage,
} from '../App';
import { API_URL } from '../config/wordpress.config';
import { toLatinSlug } from '../lib/latinSlug';
import {
  countWordsFromHtml,
  restoreImageDataUris,
  stripImageDataUris,
} from '../lib/reviewHtml';

interface ContentPreviewProps {
  content: ProcessedContent;
  contentId: string | null;
  onConfirm: () => void;
  onUpdate: (updated: ProcessedContent) => void;
  onBack: () => void;
}

type ReviewProviderId = 'anthropic' | 'openai' | 'gemini';

interface ReviewModelOption {
  id: string;
  label: string;
}

interface ReviewProviderOption {
  id: ReviewProviderId;
  label: string;
  configured: boolean;
  models: ReviewModelOption[];
  defaultModel: string;
}

interface ArticleReviewResponse {
  success?: boolean;
  article?: {
    title: string;
    excerpt: string;
    content: string;
    slug: string;
    footnotes: Footnote[];
    citations: Citation[];
    images: Array<{
      id: string;
      filename: string;
      alt: string;
      title: string;
      caption?: string;
    }>;
  };
  changeNotes?: string[];
  layoutAttention?: string[];
  provider?: ReviewProviderId;
  model?: string;
  error?: string | { message?: string };
}

function isReviewProviderId(value: string): value is ReviewProviderId {
  switch (value) {
    case 'anthropic':
    case 'openai':
    case 'gemini':
      return true;
    default:
      return false;
  }
}

/** Use the server default only when it is one of the dropdown ids. */
function listedModelId(
  provider: ReviewProviderOption | undefined,
  preferred: string
): string {
  if (!provider) return '';
  if (preferred && provider.models.some((item) => item.id === preferred)) {
    return preferred;
  }
  return provider.models[0]?.id || '';
}

function reviewErrorMessage(payload: ArticleReviewResponse | null, fallback: string): string {
  if (!payload) return fallback;
  if (typeof payload.error === 'string' && payload.error.trim()) return payload.error;
  if (payload.error && typeof payload.error === 'object' && payload.error.message) {
    return payload.error.message;
  }
  return fallback;
}

/** Longer than the server's 5-minute provider abort so this hop is not first to fail. */
const REVIEW_CLIENT_TIMEOUT_MS = 6 * 60 * 1000;

type PreviewTab = 'content' | 'footnotes' | 'citations' | 'images' | 'equations';

function imageSeoSourceLabel(source: ImageSeoSource): string {
  switch (source) {
    case 'alt':
      return 'from Word alt';
    case 'caption':
      return 'from caption';
    case 'heading':
      return 'from heading';
    case 'title':
      return 'from article title';
    case 'ai':
      return 'from AI';
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

/**
 * Generate a fresh, unique id for a new footnote/citation by finding the
 * highest existing numeric suffix in the list and incrementing it.
 * Falls back to a timestamp suffix if no numeric ids are present.
 */
const nextSequentialId = (
  prefix: string,
  existingIds: string[]
): string => {
  const numericSuffixes = existingIds
    .map((id) => {
      const match = id.match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : NaN;
    })
    .filter((n) => Number.isFinite(n));

  const next = numericSuffixes.length > 0 ? Math.max(...numericSuffixes) + 1 : 1;
  const candidate = `${prefix}-${next}`;
  // Safety net in case a non-numeric collision exists
  return existingIds.includes(candidate)
    ? `${prefix}-${Date.now()}`
    : candidate;
};

export const ContentPreview: React.FC<ContentPreviewProps> = ({
  content,
  contentId,
  onConfirm,
  onUpdate,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<PreviewTab>('content');
  const bodyRef = useRef<HTMLDivElement>(null);
  const skipNextBodySync = useRef(false);

  // Local editable copy of the processed content. We commit it back up to the
  // parent on "Looks Good, Continue →" so that the publish step receives the
  // edits. We re-sync whenever a *different* content object arrives (e.g. user
  // re-uploaded a new document and came back to preview).
  const [edited, setEdited] = useState<ProcessedContent>(content);
  const [slug, setSlug] = useState(content.slug || toLatinSlug(content.title));
  const [slugManual, setSlugManual] = useState(
    Boolean(content.slug && content.slug !== toLatinSlug(content.title))
  );
  const [providers, setProviders] = useState<ReviewProviderOption[]>([]);
  const [providerId, setProviderId] = useState<ReviewProviderId | ''>('');
  const [modelId, setModelId] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [changeNotes, setChangeNotes] = useState<string[]>([]);
  const [layoutAttention, setLayoutAttention] = useState<string[]>([]);
  const [reviewMeta, setReviewMeta] = useState<string | null>(null);

  useEffect(() => {
    setEdited(content);
    const generated = toLatinSlug(content.title);
    if (content.slug && content.slug !== generated) {
      setSlug(content.slug);
      setSlugManual(true);
    } else {
      setSlug(content.slug || generated);
      setSlugManual(false);
    }
    setChangeNotes([]);
    setLayoutAttention([]);
    setReviewMeta(null);
    setReviewError(null);
  }, [content]);

  useEffect(() => {
    if (activeTab !== 'content') {
      skipNextBodySync.current = false;
      return;
    }
    if (!bodyRef.current) return;
    if (skipNextBodySync.current) {
      skipNextBodySync.current = false;
      return;
    }
    bodyRef.current.innerHTML = edited.content;
  }, [edited.content, activeTab]);

  useEffect(() => {
    let cancelled = false;
    const loadProviders = async () => {
      try {
        const response = await fetch(`${API_URL}/api/review-providers`);
        const payload = await response.json();
        if (cancelled) return;
        const list = Array.isArray(payload.providers)
          ? (payload.providers as ReviewProviderOption[])
          : [];
        setProviders(list);
        const firstConfigured = list.find((item) => item.configured);
        if (firstConfigured) {
          setProviderId(firstConfigured.id);
          setModelId(listedModelId(firstConfigured, firstConfigured.defaultModel));
        }
      } catch {
        if (!cancelled) {
          setProviders([]);
        }
      }
    };
    void loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Field updaters ────────────────────────────────────────────────

  const updateField = <K extends keyof ProcessedContent>(
    key: K,
    value: ProcessedContent[K]
  ) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
  };

  const updateFootnote = (index: number, patch: Partial<Footnote>) => {
    setEdited((prev) => ({
      ...prev,
      footnotes: prev.footnotes.map((f, i) =>
        i === index ? { ...f, ...patch } : f
      ),
    }));
  };

  const removeFootnote = (index: number) => {
    setEdited((prev) => ({
      ...prev,
      footnotes: prev.footnotes.filter((_, i) => i !== index),
    }));
  };

  const addFootnote = () => {
    setEdited((prev) => {
      const id = nextSequentialId(
        'footnote',
        prev.footnotes.map((f) => f.id)
      );
      const newFootnote: Footnote = { id, text: '', backRef: '' };
      return { ...prev, footnotes: [...prev.footnotes, newFootnote] };
    });
  };

  const updateCitation = (index: number, patch: Partial<Citation>) => {
    setEdited((prev) => ({
      ...prev,
      citations: prev.citations.map((c, i) =>
        i === index ? { ...c, ...patch } : c
      ),
    }));
  };

  const removeCitation = (index: number) => {
    setEdited((prev) => ({
      ...prev,
      citations: prev.citations.filter((_, i) => i !== index),
    }));
  };

  const addCitation = () => {
    setEdited((prev) => {
      const id = nextSequentialId(
        'citation',
        prev.citations.map((c) => c.id)
      );
      const newCitation: Citation = { id, text: '', source: '' };
      return { ...prev, citations: [...prev.citations, newCitation] };
    });
  };

  const updateImage = (index: number, patch: Partial<ProcessedImage>) => {
    setEdited((prev) => ({
      ...prev,
      images: prev.images.map((img, i) =>
        i === index ? { ...img, ...patch } : img
      ),
    }));
  };

  // ─── Confirm ────────────────────────────────────────────────────────

  const handleTitleChange = (title: string) => {
    updateField('title', title);
    if (!slugManual) {
      setSlug(toLatinSlug(title));
    }
  };

  const handleSlugChange = (value: string) => {
    if (!value.trim()) {
      setSlugManual(false);
      setSlug(toLatinSlug(edited.title));
      return;
    }
    setSlugManual(true);
    setSlug(value);
  };

  const handleConfirm = () => {
    const bodyHtml = bodyRef.current?.innerHTML ?? edited.content;
    onUpdate({
      ...edited,
      content: bodyHtml,
      wordCount: countWordsFromHtml(bodyHtml),
      slug: toLatinSlug(slug),
      images: edited.images.map((img) => ({
        ...img,
        filename: toLatinSlug(img.filename || img.id),
      })),
    });
    onConfirm();
  };

  const handleBodyInput = () => {
    if (!bodyRef.current) return;
    skipNextBodySync.current = true;
    const html = bodyRef.current.innerHTML;
    setEdited((prev) => ({
      ...prev,
      content: html,
      wordCount: countWordsFromHtml(html),
    }));
  };

  const selectedProvider = providers.find((item) => item.id === providerId);
  const configuredProviders = providers.filter((item) => item.configured);

  const handleProviderChange = (value: string) => {
    if (!isReviewProviderId(value)) return;
    setProviderId(value);
    const next = providers.find((item) => item.id === value);
    setModelId(listedModelId(next, next?.defaultModel || ''));
    setReviewError(null);
  };

  const handleLlmReview = async () => {
    if (!isReviewProviderId(providerId) || !modelId) {
      setReviewError('Choose a provider and model first.');
      return;
    }
    if (!selectedProvider?.configured) {
      setReviewError(
        'No API key is configured for that provider. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GEMINI_API_KEY in .env and restart the server.'
      );
      return;
    }

    setReviewing(true);
    setReviewError(null);

    const bodyHtml = bodyRef.current?.innerHTML ?? edited.content;
    const overlay = {
      title: edited.title,
      excerpt: edited.excerpt,
      content: stripImageDataUris(bodyHtml, edited.images),
      footnotes: edited.footnotes,
      citations: edited.citations,
      wordCount: countWordsFromHtml(bodyHtml),
      images: edited.images.map((img) => ({
        id: img.id,
        filename: img.filename || img.id,
        alt: img.alt,
        title: img.title,
        caption: img.caption,
        seoSource: img.seoSource,
        contentType: img.contentType,
      })),
    };

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REVIEW_CLIENT_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}/api/review-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contentId,
          content: overlay,
          provider: providerId,
          model: modelId,
        }),
      });
      const payload = (await response.json()) as ArticleReviewResponse;
      if (!response.ok || !payload.success || !payload.article) {
        throw new Error(reviewErrorMessage(payload, 'LLM review failed'));
      }

      const article = payload.article;
      const restoredHtml = restoreImageDataUris(article.content, edited.images);
      const nextImages = edited.images.map((img) => {
        const reviewed = article.images.find((item) => item.id === img.id);
        if (!reviewed) return img;
        return {
          ...img,
          filename: toLatinSlug(reviewed.filename || img.filename || img.id),
          alt: reviewed.alt,
          title: reviewed.title,
          caption: reviewed.caption,
          seoSource: 'ai' as const,
        };
      });

      const nextSlug = slugManual ? toLatinSlug(slug) : article.slug || toLatinSlug(article.title);
      const nextContent: ProcessedContent = {
        ...edited,
        title: article.title,
        excerpt: article.excerpt,
        content: restoredHtml,
        footnotes: article.footnotes,
        citations: article.citations,
        images: nextImages,
        wordCount: countWordsFromHtml(restoredHtml),
        slug: nextSlug,
      };
      setEdited(nextContent);
      if (!slugManual) {
        setSlug(nextSlug);
      }
      onUpdate(nextContent);
      setChangeNotes(payload.changeNotes || []);
      setLayoutAttention(payload.layoutAttention || []);
      setReviewMeta(
        `Reviewed with ${payload.provider || providerId} / ${payload.model || modelId}`
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setReviewError('The LLM review timed out after 6 minutes. Retry, or try another model.');
      } else {
        setReviewError(error instanceof Error ? error.message : 'LLM review failed');
      }
    } finally {
      window.clearTimeout(timer);
      setReviewing(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="content-preview">
      <h2>Preview &amp; Edit Content</h2>
      <p>
        Review and adjust the converted content. Edits to title, slug, excerpt,
        footnotes, bibliography, and image metadata will be used when publishing.
      </p>

      <div className="document-info">
        <div className="document-type">
          <strong>Document Type:</strong>{' '}
          {edited.documentType === 'pdf' ? 'PDF' : 'Word Document'}
        </div>
      </div>

      <div className="preview-stats">
        <div className="stat">
          <strong>{edited.wordCount}</strong>
          <span>Words</span>
        </div>
        <div className="stat">
          <strong>{edited.footnotes.length}</strong>
          <span>Footnotes</span>
        </div>
        <div className="stat">
          <strong>{edited.citations.length}</strong>
          <span>Citations</span>
        </div>
        <div className="stat">
          <strong>{edited.images.length}</strong>
          <span>Images</span>
        </div>
        <div className="stat">
          <strong>{edited.equations?.length || 0}</strong>
          <span>Equations</span>
        </div>
      </div>

      <div className="preview-tabs">
        <button
          className={`tab ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          Content
        </button>
        <button
          className={`tab ${activeTab === 'footnotes' ? 'active' : ''}`}
          onClick={() => setActiveTab('footnotes')}
        >
          Footnotes ({edited.footnotes.length})
        </button>
        <button
          className={`tab ${activeTab === 'citations' ? 'active' : ''}`}
          onClick={() => setActiveTab('citations')}
        >
          Bibliography ({edited.citations.length})
        </button>
        {edited.images.length > 0 && (
          <button
            className={`tab ${activeTab === 'images' ? 'active' : ''}`}
            onClick={() => setActiveTab('images')}
          >
            Images ({edited.images.length})
          </button>
        )}
        {edited.equations && edited.equations.length > 0 && (
          <button
            className={`tab ${activeTab === 'equations' ? 'active' : ''}`}
            onClick={() => setActiveTab('equations')}
          >
            Equations ({edited.equations.length})
          </button>
        )}
      </div>

      <div className="preview-content">
        {/* ─── Content tab ────────────────────────────────────────── */}
        {activeTab === 'content' && (
          <div className="content-tab">
            <div className="document-meta">
              <div className="form-group">
                <label htmlFor="post-title">Title</label>
                <input
                  id="post-title"
                  type="text"
                  value={edited.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Post title"
                />
              </div>

              <div className="form-group">
                <label htmlFor="post-slug">Permalink slug</label>
                <input
                  id="post-slug"
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  onBlur={() => setSlug(toLatinSlug(slug || edited.title))}
                  placeholder="latin-article-slug"
                  spellCheck={false}
                  autoComplete="off"
                />
                <small>
                  Latin characters only, for a shareable URL. Generated from the
                  title; edit to override. Clear the field to regenerate.
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="post-excerpt">Excerpt</label>
                <textarea
                  id="post-excerpt"
                  value={edited.excerpt}
                  onChange={(e) => updateField('excerpt', e.target.value)}
                  rows={3}
                  placeholder="Short summary that appears in post lists"
                />
              </div>
            </div>

            <div className="document-content">
              <h4>Article</h4>
              <p className="field-hint">
                Click into the article to edit headings and text. Images stay
                in place; change filename, alt, and caption on the Images tab.
              </p>
              <div
                ref={bodyRef}
                className="content-html editable-body"
                contentEditable
                suppressContentEditableWarning
                onInput={handleBodyInput}
              />
            </div>
          </div>
        )}

        {/* ─── Footnotes tab ───────────────────────────────────────── */}
        {activeTab === 'footnotes' && (
          <div className="footnotes-tab">
            <div className="tab-header">
              <h4>Footnotes</h4>
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={addFootnote}
              >
                + Add Footnote
              </button>
            </div>
            <p className="field-hint">
              Note: removing or adding a footnote here updates the metadata
              only — in-text superscript markers in the body content are not
              re-numbered automatically.
            </p>

            {edited.footnotes.length > 0 ? (
              <div className="footnotes-list">
                {edited.footnotes.map((footnote, index) => (
                  <div key={footnote.id} className="footnote-item editable">
                    <div className="footnote-number">{index + 1}</div>
                    <div className="footnote-content">
                      <div className="form-group">
                        <label htmlFor={`fn-text-${footnote.id}`}>Text</label>
                        <textarea
                          id={`fn-text-${footnote.id}`}
                          value={footnote.text}
                          onChange={(e) =>
                            updateFootnote(index, { text: e.target.value })
                          }
                          rows={2}
                        />
                      </div>
                      <small>
                        ID: {footnote.id}
                        {footnote.backRef ? ` → ${footnote.backRef}` : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeFootnote(index)}
                      aria-label={`Remove footnote ${index + 1}`}
                      title="Remove footnote"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p>No footnotes yet. Click "Add Footnote" to create one.</p>
            )}
          </div>
        )}

        {/* ─── Citations / bibliography tab ────────────────────────── */}
        {activeTab === 'citations' && (
          <div className="citations-tab">
            <div className="tab-header">
              <h4>Bibliography &amp; References</h4>
              <button
                type="button"
                className="btn btn-outline btn-small"
                onClick={addCitation}
              >
                + Add Citation
              </button>
            </div>
            <p className="field-hint">
              Note: removing or adding a citation here updates the metadata
              only — in-text references in the body content are not
              re-numbered automatically.
            </p>

            {edited.citations.length > 0 ? (
              <div className="citations-list">
                {edited.citations.map((citation, index) => (
                  <div key={citation.id} className="citation-item editable">
                    <div className="citation-number">{index + 1}</div>
                    <div className="citation-content">
                      <div className="form-group">
                        <label htmlFor={`cit-text-${citation.id}`}>Text</label>
                        <textarea
                          id={`cit-text-${citation.id}`}
                          value={citation.text}
                          onChange={(e) =>
                            updateCitation(index, { text: e.target.value })
                          }
                          rows={2}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`cit-src-${citation.id}`}>Source</label>
                        <input
                          id={`cit-src-${citation.id}`}
                          type="text"
                          value={citation.source}
                          onChange={(e) =>
                            updateCitation(index, { source: e.target.value })
                          }
                          placeholder="e.g. Smith (2020), Journal of X, p. 42"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-remove"
                      onClick={() => removeCitation(index)}
                      aria-label={`Remove citation ${index + 1}`}
                      title="Remove citation"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p>No citations yet. Click "Add Citation" to create one.</p>
            )}
          </div>
        )}

        {/* ─── Images tab ──────────────────────────────────────────── */}
        {activeTab === 'images' && (
          <div className="images-tab">
            <h4>Images</h4>
            <p className="field-hint">
              Filename, title, alt text, and caption are sent to WordPress
              when the image is uploaded to the media library.
            </p>
            {edited.images.length > 0 ? (
              <div className="images-list">
                {edited.images.map((image, index) => (
                  <div key={image.id} className="image-item editable">
                    <div className="image-preview">
                      <img
                        src={`data:${image.contentType};base64,${image.data}`}
                        alt={image.alt || `Image ${index + 1}`}
                        style={{ maxWidth: '200px', maxHeight: '200px' }}
                      />
                    </div>
                    <div className="image-meta">
                      <div className="form-group">
                        <label htmlFor={`img-filename-${index}`}>
                          Filename (no extension)
                        </label>
                        <input
                          id={`img-filename-${index}`}
                          type="text"
                          value={image.filename || image.id}
                          onChange={(e) =>
                            updateImage(index, { filename: e.target.value })
                          }
                          onBlur={(e) =>
                            updateImage(index, {
                              filename: toLatinSlug(e.target.value || image.id),
                            })
                          }
                        />
                        {image.seoSource && (
                          <small className="field-hint">
                            {imageSeoSourceLabel(image.seoSource)}
                          </small>
                        )}
                      </div>
                      <div className="form-group">
                        <label htmlFor={`img-title-${index}`}>Title</label>
                        <input
                          id={`img-title-${index}`}
                          type="text"
                          value={image.title}
                          onChange={(e) =>
                            updateImage(index, { title: e.target.value })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`img-alt-${index}`}>Alt text</label>
                        <input
                          id={`img-alt-${index}`}
                          type="text"
                          value={image.alt}
                          onChange={(e) =>
                            updateImage(index, { alt: e.target.value })
                          }
                          placeholder="Describe the image for accessibility"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor={`img-caption-${index}`}>Caption</label>
                        <textarea
                          id={`img-caption-${index}`}
                          value={image.caption ?? ''}
                          onChange={(e) =>
                            updateImage(index, { caption: e.target.value })
                          }
                          rows={2}
                          placeholder="Optional caption shown beneath the image"
                        />
                      </div>
                      <small>Type: {image.contentType}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No images found in the document.</p>
            )}
          </div>
        )}

        {/* ─── Equations tab (read-only) ───────────────────────────── */}
        {activeTab === 'equations' && (
          <div className="equations-tab">
            <h4>Equations &amp; Formulas</h4>
            {edited.equations && edited.equations.length > 0 ? (
              <div className="equations-list">
                {edited.equations.map((equation, index) => (
                  <div key={equation.id} className="equation-item">
                    <div className="equation-number">{index + 1}</div>
                    <div className="equation-content">
                      <div className="equation-type">
                        <strong>Type:</strong>{' '}
                        {equation.display ? 'Display Equation' : 'Inline Equation'}
                        {equation.number && (
                          <span className="equation-ref">
                            {' '}
                            (Number: {equation.number})
                          </span>
                        )}
                      </div>
                      <div className="equation-latex">
                        <strong>LaTeX:</strong> <code>{equation.latex}</code>
                      </div>
                      <div className="equation-preview">
                        <strong>Preview:</strong>
                        <div
                          className="equation-render"
                          dangerouslySetInnerHTML={{
                            __html: equation.display
                              ? `$$${equation.latex}$$`
                              : `$${equation.latex}$`,
                          }}
                        />
                      </div>
                      <small>ID: {equation.id}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No equations found in the document.</p>
            )}
          </div>
        )}
      </div>

      <div className="llm-review-panel">
        <h4>Ask an LLM to review</h4>
        <p className="field-hint">
          Optional fallback: a model you pick rewrites the article, lists what
          it changed, and flags layout items to check. You can still edit
          everything afterwards.
        </p>
        <div className="llm-review-controls">
          <div className="form-group">
            <label htmlFor="review-provider">Provider</label>
            <select
              id="review-provider"
              value={providerId}
              onChange={(e) => handleProviderChange(e.target.value)}
              disabled={reviewing || configuredProviders.length === 0}
            >
              {providers.length === 0 && <option value="">Loading…</option>}
              {providers.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.configured}>
                  {item.label}
                  {item.configured ? '' : ' (no API key)'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="review-model">Model</label>
            <select
              id="review-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={reviewing || !selectedProvider?.configured}
            >
              {(selectedProvider?.models || []).map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleLlmReview()}
            disabled={reviewing || configuredProviders.length === 0}
          >
            {reviewing ? 'Reviewing…' : 'Ask LLM to review'}
          </button>
        </div>
        {configuredProviders.length === 0 && providers.length > 0 && (
          <p className="field-hint">
            Set <code>ANTHROPIC_API_KEY</code>, <code>OPENAI_API_KEY</code>, or{' '}
            <code>GEMINI_API_KEY</code> in the repo <code>.env</code> and restart
            the server.
          </p>
        )}
        {reviewError && <p className="review-error">{reviewError}</p>}
        {reviewMeta && <p className="field-hint">{reviewMeta}</p>}
        {changeNotes.length > 0 && (
          <div className="review-notes">
            <h5>Changes the model made</h5>
            <ul>
              {changeNotes.map((note, index) => (
                <li key={`change-${index}`}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        {layoutAttention.length > 0 && (
          <div className="review-notes review-layout">
            <h5>Layout items that need attention</h5>
            <ul>
              {layoutAttention.map((note, index) => (
                <li key={`layout-${index}`}>{note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="preview-actions">
        <button onClick={onBack} className="btn btn-outline">
          ← Back to Upload
        </button>
        <button onClick={handleConfirm} className="btn btn-primary">
          Looks Good! Continue →
        </button>
      </div>

      <div className="preview-notes">
        <h4>What happens next?</h4>
        <ul>
          <li>Your edits to the article, title, slug, excerpt, footnotes, bibliography, and image metadata are saved into the post</li>
          <li>Footnotes will be converted to WordPress-compatible links</li>
          {edited.documentType === 'word' && (
            <li>Images will be uploaded to your WordPress media library with the filename, title, alt text, and caption you specified</li>
          )}
          {edited.documentType === 'pdf' && (
            <li>PDF text has been extracted and formatted for web display</li>
          )}
          <li>Citations will be properly formatted and linked</li>
          <li>Equations will be rendered using MathJax for proper mathematical display</li>
          <li>You can choose to save as draft or publish immediately</li>
        </ul>
      </div>
    </div>
  );
};
