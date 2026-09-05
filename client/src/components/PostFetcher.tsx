import React, { useState } from 'react';
import { API_URL, WORDPRESS_CONFIG } from '../config/wordpress.config';

interface FetchedPostSummary {
  id: number;
  title: { rendered: string };
  slug: string;
  status: string;
  date: string;
  modified: string;
  link: string;
  categories: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  featured_image: { source_url: string; alt_text: string } | null;
}

interface FetchFilters {
  dateFrom: string;
  dateTo: string;
  status: string;
}

type FetchState = 'idle' | 'fetching' | 'previewing' | 'exporting' | 'done' | 'error';

interface ExportResult {
  folderName: string;
  postCount: number;
  total: number;
  message: string;
}

export const PostFetcher: React.FC = () => {
  const [filters, setFilters] = useState<FetchFilters>({
    dateFrom: '',
    dateTo: '',
    status: 'any',
  });
  const [fetchAll, setFetchAll] = useState(true);
  const [state, setState] = useState<FetchState>('idle');
  const [posts, setPosts] = useState<FetchedPostSummary[]>([]);
  const [totalPosts, setTotalPosts] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [exportResult, setExportResult] = useState<ExportResult | null>(null);

  const buildOptions = () => {
    const opts: Record<string, unknown> = {};
    if (!fetchAll) {
      if (filters.dateFrom) opts.dateFrom = filters.dateFrom;
      if (filters.dateTo) opts.dateTo = filters.dateTo;
    }
    if (filters.status !== 'any') opts.status = filters.status;
    return opts;
  };

  const handlePreview = async (page = 1) => {
    setState('fetching');
    setErrorMessage('');
    setExportResult(null);

    try {
      const response = await fetch(`${API_URL}/api/fetch-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wpConfig: WORDPRESS_CONFIG,
          options: { ...buildOptions(), page, perPage: 20 },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch posts');
      }

      setPosts(data.posts);
      setTotalPosts(data.total);
      setTotalPages(data.totalPages);
      setCurrentPage(data.page);
      setState('previewing');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  };

  const handleExport = async () => {
    setState('exporting');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_URL}/api/export-posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wpConfig: WORDPRESS_CONFIG,
          options: buildOptions(),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to export posts');
      }

      setExportResult(data);
      setState('done');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  };

  const handleReset = () => {
    setState('idle');
    setPosts([]);
    setTotalPosts(0);
    setTotalPages(0);
    setCurrentPage(1);
    setErrorMessage('');
    setExportResult(null);
  };

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const formatDate = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  return (
    <div className="post-fetcher">
      <h2>Fetch &amp; Export WordPress Posts</h2>
      <p className="section-description">
        Fetch posts from your WordPress site and save them locally as structured JSON
        for offline editing, batch updates, or backup.
      </p>

      {/* Filters */}
      <div className="fetcher-filters">
        <div className="filter-row">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={fetchAll}
              onChange={(e) => setFetchAll(e.target.checked)}
              disabled={state === 'fetching' || state === 'exporting'}
            />
            <span>Fetch all posts (ignore date range)</span>
          </label>
        </div>

        {!fetchAll && (
          <div className="filter-row date-filters">
            <div className="form-group">
              <label>From Date</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                disabled={state === 'fetching' || state === 'exporting'}
              />
            </div>
            <div className="form-group">
              <label>To Date</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                disabled={state === 'fetching' || state === 'exporting'}
              />
            </div>
          </div>
        )}

        <div className="filter-row">
          <div className="form-group">
            <label>Post Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              disabled={state === 'fetching' || state === 'exporting'}
            >
              <option value="any">Any</option>
              <option value="publish">Published</option>
              <option value="draft">Draft</option>
              <option value="private">Private</option>
              <option value="pending">Pending Review</option>
              <option value="future">Scheduled</option>
            </select>
          </div>
        </div>

        <div className="filter-actions">
          <button
            className="btn btn-primary"
            onClick={() => handlePreview(1)}
            disabled={state === 'fetching' || state === 'exporting'}
          >
            {state === 'fetching' ? 'Fetching...' : 'Preview Posts'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExport}
            disabled={state === 'fetching' || state === 'exporting'}
          >
            {state === 'exporting' ? 'Exporting...' : 'Export All to Disk'}
          </button>
        </div>
      </div>

      {/* Loading indicator */}
      {(state === 'fetching' || state === 'exporting') && (
        <div className="fetcher-loading">
          <div className="spinner" />
          <p>{state === 'fetching' ? 'Fetching posts from WordPress...' : 'Exporting all posts to disk...'}</p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="error-message">
          <strong>Error:</strong> {errorMessage}
          <button className="btn btn-small btn-outline" onClick={handleReset} style={{ marginLeft: '1rem' }}>
            Try Again
          </button>
        </div>
      )}

      {/* Export success */}
      {state === 'done' && exportResult && (
        <div className="export-success">
          <h3>Export Complete</h3>
          <p>{exportResult.message}</p>
          <div className="export-details">
            <div className="detail-item">
              <strong>Posts Exported</strong>
              <span>{exportResult.postCount}</span>
            </div>
            <div className="detail-item">
              <strong>Folder</strong>
              <span>saved-posts/{exportResult.folderName}/</span>
            </div>
          </div>
          <div className="export-structure">
            <h4>Folder Structure</h4>
            <pre>{`saved-posts/${exportResult.folderName}/
  manifest.json          ← index with all post metadata
  posts/
    post-{id}.json       ← full post data (content, categories, tags, images, meta…)`}</pre>
          </div>
          <button className="btn btn-primary" onClick={handleReset}>
            Fetch More Posts
          </button>
        </div>
      )}

      {/* Preview results */}
      {state === 'previewing' && posts.length > 0 && (
        <div className="fetcher-results">
          <div className="results-header">
            <h3>Found {totalPosts} post{totalPosts !== 1 ? 's' : ''}</h3>
            <span className="results-page">Page {currentPage} of {Math.ceil(totalPosts / 20)}</span>
          </div>

          <div className="posts-table-wrapper">
            <table className="posts-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Categories</th>
                  <th>Tags</th>
                  <th>Image</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id}>
                    <td className="col-id">{post.id}</td>
                    <td className="col-title">
                      <a href={post.link} target="_blank" rel="noopener noreferrer">
                        {stripHtml(post.title.rendered) || '(no title)'}
                      </a>
                    </td>
                    <td>
                      <span className={`status-badge status-${post.status}`}>
                        {post.status}
                      </span>
                    </td>
                    <td className="col-date">{formatDate(post.date)}</td>
                    <td className="col-cats">
                      {post.categories.map((c) => (
                        <span key={c.id} className="taxonomy-chip cat-chip">{c.name}</span>
                      ))}
                    </td>
                    <td className="col-tags">
                      {post.tags.map((t) => (
                        <span key={t.id} className="taxonomy-chip tag-chip">{t.name}</span>
                      ))}
                    </td>
                    <td className="col-img">
                      {post.featured_image ? (
                        <img
                          src={post.featured_image.source_url}
                          alt={post.featured_image.alt_text}
                          className="thumb"
                        />
                      ) : (
                        <span className="no-image">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-small btn-outline"
                disabled={currentPage <= 1}
                onClick={() => handlePreview(currentPage - 1)}
              >
                Previous
              </button>
              <span className="page-info">
                Page {currentPage} of {Math.ceil(totalPosts / 20)}
              </span>
              <button
                className="btn btn-small btn-outline"
                disabled={currentPage >= Math.ceil(totalPosts / 20)}
                onClick={() => handlePreview(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}

          {/* Export action from preview */}
          <div className="preview-export-bar">
            <p>Happy with the results? Export all {totalPosts} posts to disk as structured JSON.</p>
            <button className="btn btn-primary" onClick={handleExport}>
              Export All {totalPosts} Posts
            </button>
          </div>
        </div>
      )}

      {state === 'previewing' && posts.length === 0 && (
        <div className="no-results">
          <p>No posts found matching your filters.</p>
          <button className="btn btn-outline" onClick={handleReset}>
            Adjust Filters
          </button>
        </div>
      )}

      {/* Info panel */}
      {state === 'idle' && (
        <div className="fetcher-info">
          <h4>What gets exported?</h4>
          <ul>
            <li>Full HTML content (rendered + raw when available)</li>
            <li>Title, excerpt, slug, status, dates</li>
            <li>Categories with ID, name, slug, parent</li>
            <li>Tags with ID, name, slug</li>
            <li>Featured image URL and media details (dimensions, sizes)</li>
            <li>Author info (ID, name, slug)</li>
            <li>Post meta, format, template, sticky flag</li>
            <li>Comment and ping status</li>
          </ul>
          <p className="info-note">
            Each post is saved as an individual JSON file, plus a <code>manifest.json</code> index
            for easy programmatic access.
          </p>
        </div>
      )}
    </div>
  );
};
