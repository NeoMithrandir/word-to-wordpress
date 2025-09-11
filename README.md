# Word to WordPress Converter

A powerful, efficient application that converts Microsoft Word documents (.docx, .doc) to WordPress posts while preserving **formatting**, **footnotes**, **citations**, and **layout**.

## ✨ Key Features

- **🔄 Reliable Document Processing**: Uses mammoth.js for accurate Word document parsing
- **📝 Preserves Formatting**: Maintains headings, bold, italic, lists, tables, and blockquotes
- **🔗 Smart Footnotes**: Converts footnotes to clickable WordPress links with back-references
- **📚 Citation Management**: Preserves academic citations and references
- **🖼️ Image Handling**: Uploads images to WordPress media library automatically
- **🎯 WordPress Integration**: Direct publishing via WordPress REST API
- **📱 Modern UI**: Clean, responsive React interface
- **🔒 Secure**: Uses WordPress Application Passwords for authentication

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- WordPress site with REST API enabled
- WordPress Application Password (see setup below)

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd word-to-wordpress
   npm run install:all
   ```

2. **Set up environment (optional):**
   ```bash
   cp .env.example .env
   # Edit .env with your default WordPress settings (optional)
   ```

3. **Start the application:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   Open [http://localhost:3006](http://localhost:3006) in your browser

## 📋 WordPress Setup

### 1. Enable REST API
WordPress REST API is enabled by default in WordPress 4.7+. If you're using an older version or have it disabled, enable it through your theme or a plugin.

### 2. Create Application Password

**For WordPress 5.6+:**
1. Go to **Users → Profile** in your WordPress admin
2. Scroll to **Application Passwords**
3. Enter a name (e.g., "Word Converter")
4. Click **Add New Application Password**
5. **Copy the generated password** - you'll need this for the app

**For older WordPress versions:**
Install the [Application Passwords plugin](https://wordpress.org/plugins/application-passwords/)

### 3. Test Your Setup
The app includes a connection tester to verify your WordPress credentials before processing documents.

## 🎯 How to Use

### Step 1: Upload Document
- Drag & drop or select your Word document (.docx or .doc)
- Supports files up to 50MB
- Processing happens automatically

### Step 2: Preview Content
- Review the converted content
- Check footnotes, citations, and images
- Verify formatting looks correct

### Step 3: Publish
- Set post title and excerpt
- Choose status: Draft, Publish, or Private
- Click publish to create your WordPress post

### 📝 WordPress Configuration
The WordPress site credentials are pre-configured in `client/src/config/wordpress.config.ts`. To change the WordPress site:
1. Edit `client/src/config/wordpress.config.ts`
2. Update the `siteUrl`, `username`, and `password` fields
3. Restart the application

## 🔧 Advanced Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Default WordPress Configuration (optional)
WP_SITE_URL=https://your-wordpress-site.com
WP_USERNAME=your-username
WP_PASSWORD=your-app-password

# Security
JWT_SECRET=your-jwt-secret-here
UPLOAD_LIMIT_MB=50
```

### Custom Document Processing

The `DocumentProcessor` service can be extended to handle special formatting:

```typescript
// src/services/DocumentProcessor.ts
const options = {
  styleMap: [
    // Add custom style mappings
    "p[style-name='Custom Style'] => div.custom:fresh"
  ]
};
```

## 🏗️ Architecture

### Backend (Node.js/TypeScript)
- **Express Server**: REST API with security middleware
- **DocumentProcessor**: Handles Word document parsing with mammoth.js
- **WordPressService**: Manages WordPress API integration
- **File Upload**: Secure document upload with validation

### Frontend (React/TypeScript)
- **DocumentUpload**: Drag-and-drop file interface
- **WordPressConfig**: Connection setup and testing
- **ContentPreview**: Review converted content
- **PublishSettings**: Final publishing options

### Document Processing Pipeline
1. **Upload**: Secure file upload with MIME type validation
2. **Parse**: mammoth.js converts Word to HTML
3. **Process**: Extract footnotes, citations, and images
4. **Enhance**: Add WordPress-compatible formatting
5. **Publish**: Upload to WordPress via REST API

## 📁 Project Structure

```
word-to-wordpress/
├── src/                          # Backend source
│   ├── server.ts                # Express server
│   ├── services/
│   │   ├── DocumentProcessor.ts # Document parsing logic
│   │   └── WordPressService.ts  # WordPress API integration
│   └── middleware/
│       └── errorHandler.ts      # Error handling
├── client/                       # Frontend React app
│   ├── src/
│   │   ├── App.tsx              # Main application
│   │   ├── components/          # React components
│   │   └── App.css              # Styling
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
└── README.md                   # This file
```

## 🔍 What Gets Preserved

### ✅ Supported Elements
- **Document Structure**: Headings (H1-H6), paragraphs
- **Text Formatting**: Bold, italic, underline, strikethrough
- **Lists**: Ordered and unordered lists with nesting
- **Tables**: Full table structure with formatting
- **Links**: External and internal links
- **Images**: All image types with alt text and captions
- **Footnotes**: With proper linking and back-references
- **Citations**: Academic references and bibliographies
- **Blockquotes**: Styled quote blocks
- **Code Blocks**: Preformatted text sections

### ⚠️ Limitations
- **Embedded Objects**: Charts and embedded files (converted to images where possible)
- **Advanced Tables**: Complex merged cells may need manual adjustment
- **Custom Fonts**: WordPress theme fonts will be used
- **Page Layout**: Single-column WordPress post format

## 🚀 Deployment

### Development
```bash
npm run dev  # Starts both server and client
```

### Production Build
```bash
npm run build    # Build both server and client
npm start        # Start production server
```

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

## 🛠️ API Reference

### POST /api/upload
Upload and process a Word document.

**Request**: `multipart/form-data` with `document` field
**Response**: 
```json
{
  "success": true,
  "content": {
    "title": "Document Title",
    "content": "<html>...</html>",
    "footnotes": [...],
    "citations": [...],
    "images": [...],
    "wordCount": 1250
  }
}
```

### POST /api/publish
Publish processed content to WordPress.

**Request**:
```json
{
  "content": { /* ProcessedContent */ },
  "wpConfig": {
    "siteUrl": "https://site.com",
    "username": "user",
    "password": "app-password"
  },
  "postData": {
    "title": "Post Title",
    "status": "draft"
  }
}
```

### POST /api/test-connection
Test WordPress connection.

**Request**: `{ "wpConfig": { ... } }`
**Response**: `{ "success": true, "connected": true }`

## 🐛 Troubleshooting

### Common Issues

**"Connection failed" error:**
- Verify WordPress URL format (include https://)
- Check Application Password (not regular password)
- Ensure REST API is enabled on your WordPress site

**"Document processing failed":**
- Check file format (.docx or .doc only)
- Verify file isn't corrupted
- Try with a simpler document to test

**"Upload timeout":**
- Reduce document size or image count
- Check server upload limits
- Verify network connection

**Missing footnotes:**
- Ensure footnotes are created using Word's footnote feature
- Check that footnote references are properly linked

### Debug Mode
Set `NODE_ENV=development` to see detailed error messages and processing logs.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and add tests
4. Commit your changes: `git commit -am 'Add new feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [mammoth.js](https://github.com/mwilliamson/mammoth.js) - Excellent Word document processing
- [WordPress REST API](https://developer.wordpress.org/rest-api/) - Powerful publishing platform
- [React Dropzone](https://github.com/react-dropzone/react-dropzone) - Great file upload experience

## 💬 Support

- 📧 Email: [support@example.com](mailto:support@example.com)
- 📖 Documentation: See inline code comments
- 🐛 Issues: Submit via GitHub Issues
- 💡 Feature Requests: GitHub Discussions

---

**Made with ❤️ for content creators and academics who need reliable Word-to-WordPress conversion.** 