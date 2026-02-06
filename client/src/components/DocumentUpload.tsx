import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import axios from 'axios';
import { ProcessedContent } from '../App';
import { API_URL } from '../config/wordpress.config';

interface DocumentUploadProps {
  onDocumentProcessed: (content: ProcessedContent) => void;
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ onDocumentProcessed }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    setIsUploading(true);
    setError(null);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('document', file);

    try {
      const response = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(percentCompleted);
          }
        },
      });

      if (response.data.success) {
        onDocumentProcessed(response.data.content);
      } else {
        throw new Error(response.data.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
      if (axios.isAxiosError(err) && err.response) {
        const errorData = err.response.data.error;
        // Handle error object structure from backend
        if (typeof errorData === 'object' && errorData.message) {
          setError(errorData.message);
        } else if (typeof errorData === 'string') {
          setError(errorData);
        } else {
          setError('Upload failed');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Upload failed');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }, [onDocumentProcessed]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    maxSize: 128 * 1024 * 1024, // 128 MB
    disabled: isUploading
  });

  return (
    <div className="document-upload">
      <h2>Upload Document</h2>
      
      <div
        {...getRootProps()}
        className={`dropzone ${isDragActive ? 'active' : ''} ${isDragReject ? 'reject' : ''} ${isUploading ? 'uploading' : ''}`}
      >
        <input {...getInputProps()} />
        
        {isUploading ? (
          <div className="upload-progress">
            <div className="spinner"></div>
            <p>Processing document...</p>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p>{uploadProgress}% uploaded</p>
          </div>
        ) : (
          <div className="upload-content">
            {isDragActive ? (
              <p>Drop the document here...</p>
            ) : (
              <>
                <div className="upload-icon">📄</div>
                <p>Drag & drop a document here, or click to select</p>
                <p className="upload-hint">
                  Supports Word (.docx, .doc) and PDF files up to 50MB
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="upload-features">
        <h3>What gets preserved:</h3>
        <ul>
          <li>✅ Document structure and headings</li>
          <li>✅ Text formatting (bold, italic, underline)</li>
          <li>✅ Lists and tables</li>
          <li>✅ Footnotes with clickable links</li>
          <li>✅ Citations and references</li>
          <li>✅ Mathematical equations and formulas</li>
          <li>✅ Images and media (Word docs)</li>
          <li>✅ Blockquotes and code blocks</li>
        </ul>
        
        <div className="file-support">
          <h4>📋 Supported File Types:</h4>
          <ul>
            <li><strong>Word Documents:</strong> .docx, .doc (full feature support)</li>
            <li><strong>PDF Files:</strong> .pdf (text extraction with smart formatting)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}; 