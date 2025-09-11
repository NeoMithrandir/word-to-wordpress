import React, { useState } from 'react';
import { ProcessedContent } from '../App';

interface ContentPreviewProps {
  content: ProcessedContent;
  onConfirm: () => void;
  onBack: () => void;
}

export const ContentPreview: React.FC<ContentPreviewProps> = ({ content, onConfirm, onBack }) => {
  const [activeTab, setActiveTab] = useState<'content' | 'footnotes' | 'citations' | 'images' | 'equations'>('content');

  return (
    <div className="content-preview">
      <h2>Preview Converted Content</h2>
      <p>Review how your document will appear in WordPress before publishing.</p>

      <div className="document-info">
        <div className="document-type">
          <strong>Document Type:</strong> {content.documentType === 'pdf' ? '📄 PDF' : '📝 Word Document'}
        </div>
      </div>

      <div className="preview-stats">
        <div className="stat">
          <strong>{content.wordCount}</strong>
          <span>Words</span>
        </div>
        <div className="stat">
          <strong>{content.footnotes.length}</strong>
          <span>Footnotes</span>
        </div>
        <div className="stat">
          <strong>{content.citations.length}</strong>
          <span>Citations</span>
        </div>
        <div className="stat">
          <strong>{content.images.length}</strong>
          <span>Images</span>
        </div>
        <div className="stat">
          <strong>{content.equations?.length || 0}</strong>
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
        {content.footnotes.length > 0 && (
          <button
            className={`tab ${activeTab === 'footnotes' ? 'active' : ''}`}
            onClick={() => setActiveTab('footnotes')}
          >
            Footnotes ({content.footnotes.length})
          </button>
        )}
        {content.citations.length > 0 && (
          <button
            className={`tab ${activeTab === 'citations' ? 'active' : ''}`}
            onClick={() => setActiveTab('citations')}
          >
            Citations ({content.citations.length})
          </button>
        )}
        {content.images.length > 0 && (
          <button
            className={`tab ${activeTab === 'images' ? 'active' : ''}`}
            onClick={() => setActiveTab('images')}
          >
            Images ({content.images.length})
          </button>
        )}
        {content.equations && content.equations.length > 0 && (
          <button
            className={`tab ${activeTab === 'equations' ? 'active' : ''}`}
            onClick={() => setActiveTab('equations')}
          >
            Equations ({content.equations.length})
          </button>
        )}
      </div>

      <div className="preview-content">
        {activeTab === 'content' && (
          <div className="content-tab">
            <div className="document-meta">
              <h3>Title: {content.title}</h3>
              <p className="excerpt"><strong>Excerpt:</strong> {content.excerpt}</p>
            </div>
            
            <div className="document-content">
              <h4>Content Preview:</h4>
              <div 
                className="content-html"
                dangerouslySetInnerHTML={{ __html: content.content }}
              />
            </div>
          </div>
        )}

        {activeTab === 'footnotes' && (
          <div className="footnotes-tab">
            <h4>Footnotes</h4>
            {content.footnotes.length > 0 ? (
              <div className="footnotes-list">
                {content.footnotes.map((footnote, index) => (
                  <div key={footnote.id} className="footnote-item">
                    <div className="footnote-number">{index + 1}</div>
                    <div className="footnote-content">
                      <p>{footnote.text}</p>
                      <small>ID: {footnote.id} → {footnote.backRef}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No footnotes found in the document.</p>
            )}
          </div>
        )}

        {activeTab === 'citations' && (
          <div className="citations-tab">
            <h4>Citations & References</h4>
            {content.citations.length > 0 ? (
              <div className="citations-list">
                {content.citations.map((citation, index) => (
                  <div key={citation.id} className="citation-item">
                    <div className="citation-number">{index + 1}</div>
                    <div className="citation-content">
                      <p>{citation.text}</p>
                      <small>
                        <strong>Source:</strong> {citation.source}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No citations found in the document.</p>
            )}
          </div>
        )}

        {activeTab === 'images' && (
          <div className="images-tab">
            <h4>Images</h4>
            {content.images.length > 0 ? (
              <div className="images-list">
                {content.images.map((image, index) => (
                  <div key={image.id} className="image-item">
                    <div className="image-preview">
                      <img 
                        src={`data:${image.contentType};base64,${image.data}`}
                        alt={image.alt || `Image ${index + 1}`}
                        style={{ maxWidth: '200px', maxHeight: '200px' }}
                      />
                    </div>
                    <div className="image-meta">
                      <p><strong>ID:</strong> {image.id}</p>
                      <p><strong>Alt Text:</strong> {image.alt || 'None'}</p>
                      <p><strong>Title:</strong> {image.title || 'None'}</p>
                      <p><strong>Type:</strong> {image.contentType}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>No images found in the document.</p>
            )}
          </div>
        )}

        {activeTab === 'equations' && (
          <div className="equations-tab">
            <h4>Equations & Formulas</h4>
            {content.equations && content.equations.length > 0 ? (
              <div className="equations-list">
                {content.equations.map((equation, index) => (
                  <div key={equation.id} className="equation-item">
                    <div className="equation-number">{index + 1}</div>
                    <div className="equation-content">
                      <div className="equation-type">
                        <strong>Type:</strong> {equation.display ? 'Display Equation' : 'Inline Equation'}
                        {equation.number && <span className="equation-ref"> (Number: {equation.number})</span>}
                      </div>
                      <div className="equation-latex">
                        <strong>LaTeX:</strong> <code>{equation.latex}</code>
                      </div>
                      <div className="equation-preview">
                        <strong>Preview:</strong>
                        <div 
                          className="equation-render"
                          dangerouslySetInnerHTML={{ 
                            __html: equation.display ? `$$${equation.latex}$$` : `$${equation.latex}$` 
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

      <div className="preview-actions">
        <button onClick={onBack} className="btn btn-outline">
          ← Back to Upload
        </button>
        <button onClick={onConfirm} className="btn btn-primary">
          Looks Good! Continue →
        </button>
      </div>

      <div className="preview-notes">
        <h4>📝 What happens next?</h4>
        <ul>
          <li>Your document structure and formatting will be preserved</li>
          <li>Footnotes will be converted to WordPress-compatible links</li>
          {content.documentType === 'word' && (
            <li>Images will be uploaded to your WordPress media library</li>
          )}
          {content.documentType === 'pdf' && (
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