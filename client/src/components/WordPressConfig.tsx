import React, { useState } from 'react';
import axios from 'axios';
import { WPConfig } from '../App';

interface WordPressConfigProps {
  onConfigSaved: (config: WPConfig) => void;
  onBack: () => void;
}

export const WordPressConfig: React.FC<WordPressConfigProps> = ({ onConfigSaved, onBack }) => {
  const [config, setConfig] = useState<WPConfig>({
    siteUrl: '',
    username: '',
    password: ''
  });
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof WPConfig, value: string) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setConnectionStatus('idle');
    setError(null);
  };

  const testConnection = async () => {
    if (!config.siteUrl || !config.username || !config.password) {
      setError('Please fill in all fields');
      return;
    }

    setIsTestingConnection(true);
    setError(null);

    try {
      const response = await axios.post('http://localhost:3007/api/test-connection', {
        wpConfig: config
      });

      if (response.data.success && response.data.connected) {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
        setError('Connection failed. Please check your credentials.');
      }
    } catch (err) {
      setConnectionStatus('error');
      if (axios.isAxiosError(err) && err.response) {
        const errorData = err.response.data.error;
        // Handle error object structure from backend
        if (typeof errorData === 'object' && errorData.message) {
          setError(errorData.message);
        } else if (typeof errorData === 'string') {
          setError(errorData);
        } else {
          setError('Connection test failed');
        }
      } else {
        setError(err instanceof Error ? err.message : 'Connection test failed');
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSave = () => {
    if (connectionStatus === 'success') {
      onConfigSaved(config);
    } else {
      setError('Please test the connection first');
    }
  };

  return (
    <div className="wordpress-config">
      <h2>WordPress Configuration</h2>
      <p>Enter your WordPress site details to publish your converted document.</p>

      <form onSubmit={(e) => e.preventDefault()} className="config-form">
        <div className="form-group">
          <label htmlFor="siteUrl">WordPress Site URL</label>
          <input
            id="siteUrl"
            type="url"
            placeholder="https://your-site.com"
            value={config.siteUrl}
            onChange={(e) => handleInputChange('siteUrl', e.target.value)}
            required
          />
          <small>Your WordPress site URL (with https://)</small>
        </div>

        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="your-username"
            value={config.username}
            onChange={(e) => handleInputChange('username', e.target.value)}
            required
          />
          <small>Your WordPress username</small>
        </div>

        <div className="form-group">
          <label htmlFor="password">Application Password</label>
          <input
            id="password"
            type="password"
            placeholder="xxxx xxxx xxxx xxxx"
            value={config.password}
            onChange={(e) => handleInputChange('password', e.target.value)}
            required
          />
          <small>
            <a 
              href="https://wordpress.org/support/article/application-passwords/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Generate an Application Password
            </a> in your WordPress admin (not your regular password)
          </small>
        </div>

        <div className="form-actions">
          <button
            type="button"
            onClick={testConnection}
            disabled={isTestingConnection || !config.siteUrl || !config.username || !config.password}
            className="btn btn-secondary"
          >
            {isTestingConnection ? 'Testing...' : 'Test Connection'}
          </button>

          {connectionStatus === 'success' && (
            <div className="connection-success">
              ✅ Connection successful!
            </div>
          )}
        </div>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}
      </form>

      <div className="config-help">
        <h3>Need Help?</h3>
        <div className="help-content">
          <div className="help-item">
            <h4>Application Password</h4>
            <p>
              Go to your WordPress admin → Users → Profile → Application Passwords.
              Create a new password specifically for this app.
            </p>
          </div>
          <div className="help-item">
            <h4>Site URL Format</h4>
            <p>
              Include the full URL: <code>https://yourdomain.com</code><br/>
              For subdirectories: <code>https://yourdomain.com/blog</code>
            </p>
          </div>
          <div className="help-item">
            <h4>Permissions</h4>
            <p>
              Make sure your user account has permission to create posts and upload media.
            </p>
          </div>
        </div>
      </div>

      <div className="form-navigation">
        <button onClick={onBack} className="btn btn-outline">
          ← Back
        </button>
        <button
          onClick={handleSave}
          disabled={connectionStatus !== 'success'}
          className="btn btn-primary"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}; 