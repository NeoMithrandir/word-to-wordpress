import React, { useEffect, useState } from 'react';
import { API_URL } from '../config/wordpress.config';

type LivePublishSource = 'publish' | 'replay' | 'manual';

interface LivePublishStepResult {
  ok: boolean;
  message: string;
  output?: string;
}

interface LivePublishLogEntry {
  id: string;
  slug: string;
  title?: string;
  postId?: number;
  postUrl?: string;
  publishedAt?: string;
  timestamp: string;
  source: LivePublishSource;
  simplifications: LivePublishStepResult;
  deploy: LivePublishStepResult;
}

type LogState = 'idle' | 'loading' | 'running' | 'error';

function sourceLabel(source: LivePublishSource): string {
  switch (source) {
    case 'publish':
      return 'publish';
    case 'replay':
      return 'replay';
    case 'manual':
      return 'manual';
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function stepLabel(result: LivePublishStepResult): string {
  return result.ok ? 'ok' : 'failed';
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    const message = (error as { message: string }).message.trim();
    if (message) return message;
  }
  return fallback;
}

function stepDetail(result: LivePublishStepResult): string {
  return [result.message, result.output].filter(Boolean).join('\n');
}

function formatTimestamp(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export const LivePublishLog: React.FC = () => {
  const [entries, setEntries] = useState<LivePublishLogEntry[]>([]);
  const [state, setState] = useState<LogState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [postUrl, setPostUrl] = useState('');

  const loadLog = async () => {
    setState('loading');
    setErrorMessage('');
    try {
      const response = await fetch(`${API_URL}/api/live-publish-log`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(apiErrorMessage(data, 'Failed to load live-publish log'));
      }
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setState('idle');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      setState('error');
    }
  };

  useEffect(() => {
    void loadLog();
  }, []);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((entryId) => entryId !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    if (selectedIds.length === entries.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(entries.map((entry) => entry.id));
  };

  const handlePushSlug = async () => {
    const trimmed = slug.trim();
    if (!trimmed) {
      setErrorMessage('Enter an arthra post slug.');
      return;
    }

    setState('running');
    setErrorMessage('');
    setStatusMessage(`Running live pipeline for "${trimmed}"…`);

    try {
      const response = await fetch(`${API_URL}/api/live-publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: trimmed,
          title: title.trim() || undefined,
          postUrl: postUrl.trim() || undefined,
          source: 'manual'
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, 'Live pipeline failed'));
      }
      setStatusMessage(
        [
          data.simplifications?.message,
          data.deploy?.message
        ].filter(Boolean).join(' — ') || 'Pipeline finished'
      );
      setSlug('');
      setTitle('');
      setPostUrl('');
      await loadLog();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      setState('error');
    }
  };

  const handleReplaySelected = async () => {
    if (selectedIds.length === 0) {
      setErrorMessage('Select one or more logged articles to re-run.');
      return;
    }

    setState('running');
    setErrorMessage('');
    setStatusMessage(`Replaying ${selectedIds.length} article${selectedIds.length === 1 ? '' : 's'}…`);

    try {
      const response = await fetch(`${API_URL}/api/live-publish/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(data, 'Replay failed'));
      }
      const count = Array.isArray(data.results) ? data.results.length : selectedIds.length;
      setStatusMessage(`Replayed ${count} article${count === 1 ? '' : 's'}.`);
      setSelectedIds([]);
      await loadLog();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unknown error');
      setState('error');
    }
  };

  const busy = state === 'loading' || state === 'running';

  return (
    <div className="post-fetcher">
      <h2>Live Publish Log</h2>
      <p className="section-description">
        After a public arthra.inscience.gr publish, this tool generates Με πιο απλά Λόγια,
        rebuilds the public Astro site, and records each attempt here. Use this page to
        push a slug that was published manually, or re-run past articles.
      </p>

      <div className="fetcher-filters">
        <div className="filter-row">
          <div className="form-group">
            <label htmlFor="live-slug">Arthra slug</label>
            <input
              id="live-slug"
              type="text"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="article-slug"
              disabled={busy}
            />
          </div>
        </div>
        <div className="filter-row date-filters">
          <div className="form-group">
            <label htmlFor="live-title">Title (optional)</label>
            <input
              id="live-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Article title"
              disabled={busy}
            />
          </div>
          <div className="form-group">
            <label htmlFor="live-url">Arthra URL (optional)</label>
            <input
              id="live-url"
              type="url"
              value={postUrl}
              onChange={(event) => setPostUrl(event.target.value)}
              placeholder="https://arthra.inscience.gr/…"
              disabled={busy}
            />
          </div>
        </div>
        <div className="filter-actions">
          <button className="btn btn-primary" onClick={handlePushSlug} disabled={busy || !slug.trim()}>
            {state === 'running' ? 'Running…' : 'Push slug to live'}
          </button>
          <button className="btn btn-secondary" onClick={handleReplaySelected} disabled={busy || selectedIds.length === 0}>
            Re-run selected ({selectedIds.length})
          </button>
          <button className="btn btn-outline" onClick={() => void loadLog()} disabled={busy}>
            Refresh log
          </button>
        </div>
      </div>

      {(state === 'running' || state === 'loading') && (
        <div className="fetcher-loading">
          <div className="spinner" />
          <p>
            {state === 'running'
              ? statusMessage || 'Running live pipeline… this can take several minutes.'
              : 'Loading log…'}
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="error-message">
          <strong>Error:</strong> {errorMessage}
          <button className="btn btn-small btn-outline" onClick={() => void loadLog()} style={{ marginLeft: '1rem' }}>
            Reload
          </button>
        </div>
      )}

      {state !== 'error' && statusMessage && state !== 'running' && (
        <p className="info-note">{statusMessage}</p>
      )}

      {entries.length > 0 && (
        <div className="fetcher-results">
          <div className="results-header">
            <h3>{entries.length} logged attempt{entries.length !== 1 ? 's' : ''}</h3>
            <button className="btn btn-small btn-outline" onClick={toggleAll} disabled={busy}>
              {selectedIds.length === entries.length ? 'Clear selection' : 'Select all'}
            </button>
          </div>
          <div className="posts-table-wrapper">
            <table className="posts-table">
              <thead>
                <tr>
                  <th />
                  <th>When</th>
                  <th>Slug</th>
                  <th>Title</th>
                  <th>Source</th>
                  <th>Με πιο απλά Λόγια</th>
                  <th>Deploy</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(entry.id)}
                        onChange={() => toggleSelected(entry.id)}
                        disabled={busy}
                        aria-label={`Select ${entry.slug}`}
                      />
                    </td>
                    <td className="col-date">{formatTimestamp(entry.timestamp)}</td>
                    <td className="col-title">
                      {entry.postUrl ? (
                        <a href={entry.postUrl} target="_blank" rel="noopener noreferrer">
                          {entry.slug}
                        </a>
                      ) : (
                        entry.slug
                      )}
                    </td>
                    <td>{entry.title || '—'}</td>
                    <td>
                      <span className={`status-badge status-${entry.source === 'publish' ? 'publish' : entry.source === 'replay' ? 'pending' : 'draft'}`}>
                        {sourceLabel(entry.source)}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge ${entry.simplifications.ok ? 'status-publish' : 'status-draft'}`}>
                        {stepLabel(entry.simplifications)}
                      </span>
                      {stepDetail(entry.simplifications) && (
                        <div className="info-note">{stepDetail(entry.simplifications)}</div>
                      )}
                    </td>
                    <td>
                      <span className={`status-badge ${entry.deploy.ok ? 'status-publish' : 'status-draft'}`}>
                        {stepLabel(entry.deploy)}
                      </span>
                      {stepDetail(entry.deploy) && (
                        <div className="info-note">{stepDetail(entry.deploy)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {state === 'idle' && entries.length === 0 && (
        <div className="no-results">
          <p>No live-publish attempts yet. Publish publicly to arthra, or push a slug above.</p>
        </div>
      )}

      {state === 'idle' && (
        <div className="fetcher-info">
          <h4>What this log is for</h4>
          <ul>
            <li>Every public arthra publish from this tool is recorded</li>
            <li>Manual slugs (published on arthra outside this tool) can be pushed here</li>
            <li>Re-run selected rows to regenerate Με πιο απλά Λόγια and rebuild the public site</li>
            <li>Log file: saved-posts/live-publish-log.json</li>
          </ul>
        </div>
      )}
    </div>
  );
};
