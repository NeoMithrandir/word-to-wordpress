"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocalSaveService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class LocalSaveService {
    constructor() {
        this.saveDirectory = path_1.default.join(process.cwd(), 'saved-posts');
        this.ensureSaveDirectory();
    }
    /**
     * Ensure the save directory exists
     */
    ensureSaveDirectory() {
        if (!fs_1.default.existsSync(this.saveDirectory)) {
            fs_1.default.mkdirSync(this.saveDirectory, { recursive: true });
            console.log('Created saved-posts directory');
        }
    }
    /**
     * Save post data locally as JSON
     */
    async savePost(content, postData) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `post-${timestamp}.json`;
            const filepath = path_1.default.join(this.saveDirectory, filename);
            const dataToSave = {
                savedAt: new Date().toISOString(),
                content,
                postData,
                metadata: {
                    originalTitle: content.title,
                    wordCount: content.wordCount,
                    hasFootnotes: content.footnotes.length > 0,
                    hasCitations: content.citations.length > 0,
                    hasEquations: content.equations && content.equations.length > 0,
                    imageCount: content.images.length,
                    equationCount: content.equations ? content.equations.length : 0,
                },
            };
            fs_1.default.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
            console.log(`Post saved locally: ${filename}`);
            return filename;
        }
        catch (error) {
            console.error('Error saving post locally:', error);
            throw new Error('Failed to save post locally');
        }
    }
    /**
     * List all saved posts
     */
    async listSavedPosts() {
        try {
            const files = fs_1.default.readdirSync(this.saveDirectory);
            return files.filter((file) => file.endsWith('.json'));
        }
        catch (error) {
            console.error('Error listing saved posts:', error);
            return [];
        }
    }
    /**
     * Load a saved post
     */
    async loadPost(filename) {
        try {
            const filepath = path_1.default.join(this.saveDirectory, filename);
            const data = fs_1.default.readFileSync(filepath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error('Error loading saved post:', error);
            throw new Error('Failed to load saved post');
        }
    }
    // ─── Image Saving Helpers ─────────────────────────────────────────
    /**
     * Map a MIME content-type to a file extension.
     * We convert everything to .jpg on disk unless it's PNG/GIF/WebP.
     */
    imageExtension(contentType) {
        const map = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/bmp': '.jpg', // BMPs are saved as .jpg (will remain BMP bytes — rename is cosmetic)
        };
        return map[contentType] || '.jpg';
    }
    /**
     * Save every image from ProcessedContent.images as an individual file
     * inside `folderPath`, and return a map from the original base64 data-URI
     * prefix to the relative filename so the HTML can be rewritten.
     *
     * A companion `images-metadata.json` is written to the same folder.
     */
    saveImages(images, folderPath) {
        // Map: image id → relative filename (e.g. "image-1.jpg")
        const uriToFile = new Map();
        const metaEntries = [];
        for (const img of images) {
            const ext = this.imageExtension(img.contentType);
            const filename = `${img.id}${ext}`;
            const filePath = path_1.default.join(folderPath, filename);
            // Write the raw image bytes
            fs_1.default.writeFileSync(filePath, img.data);
            // Record metadata
            metaEntries.push({
                filename,
                originalId: img.id,
                alt: img.alt,
                title: img.title,
                contentType: img.contentType,
                sizeBytes: img.data.length,
            });
            // We'll use the image id to locate and replace the data-URI later
            uriToFile.set(img.id, filename);
            console.log(`  Saved image ${filename} (${img.contentType}, ${img.data.length} bytes)`);
        }
        // Write metadata sidecar
        if (metaEntries.length > 0) {
            const metaPath = path_1.default.join(folderPath, 'images-metadata.json');
            fs_1.default.writeFileSync(metaPath, JSON.stringify(metaEntries, null, 2));
            console.log(`  Saved images-metadata.json (${metaEntries.length} images)`);
        }
        return uriToFile;
    }
    /**
     * Replace every base64 data-URI `<img>` in `html` with a relative file
     * path, using the ProcessedImage array to match on content-type + data.
     *
     * Returns the rewritten HTML string.
     */
    replaceDataUrisWithFiles(html, images, uriToFile) {
        if (images.length === 0)
            return html;
        let result = html;
        // For each image, build the data-URI prefix and replace with the file path.
        // We match "data:<type>;base64,<first-80-chars>..." — enough to be unique.
        for (const img of images) {
            const filename = uriToFile.get(img.id);
            if (!filename)
                continue;
            const base64 = img.data.toString('base64');
            const dataUri = `data:${img.contentType};base64,${base64}`;
            // Replace the full data URI with the relative file path
            result = result.split(dataUri).join(`./${filename}`);
        }
        return result;
    }
    // ─── Save as HTML ─────────────────────────────────────────────────
    /**
     * Save the post as an HTML file inside its own folder, with images
     * extracted to separate files alongside it.
     *
     * Folder structure:
     *   saved-posts/
     *     post-<timestamp>/
     *       index.html
     *       image-1.jpg
     *       image-2.png
     *       images-metadata.json
     *
     * Returns the folder name (e.g. "post-2025-09-11T19-27-58-751Z").
     */
    async savePostAsHtml(content, postData) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const folderName = `post-${timestamp}`;
            const folderPath = path_1.default.join(this.saveDirectory, folderName);
            // Create the post folder
            fs_1.default.mkdirSync(folderPath, { recursive: true });
            // Save images as separate files and get the URI→filename map
            const uriToFile = this.saveImages(content.images, folderPath);
            console.log(`Saved ${content.images.length} images to ${folderName}/`);
            // Generate the HTML document
            let htmlContent = this.generateHtmlDocument(content, postData);
            // Rewrite base64 data URIs → relative file paths
            htmlContent = this.replaceDataUrisWithFiles(htmlContent, content.images, uriToFile);
            // Write the HTML file
            const htmlPath = path_1.default.join(folderPath, 'index.html');
            fs_1.default.writeFileSync(htmlPath, htmlContent);
            console.log(`Post saved as HTML: ${folderName}/index.html`);
            return folderName;
        }
        catch (error) {
            console.error('Error saving post as HTML:', error);
            throw new Error('Failed to save post as HTML');
        }
    }
    /**
     * Generate complete HTML document
     */
    generateHtmlDocument(content, postData) {
        const hasEquations = content.equations && content.equations.length > 0;
        const htmlDoc = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${postData.title || content.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
        }
        
        .container {
            background: white;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
            margin-bottom: 30px;
        }
        
        h2, h3, h4, h5, h6 {
            color: #34495e;
            margin-top: 30px;
            margin-bottom: 15px;
        }
        
        p {
            margin-bottom: 15px;
            text-align: justify;
        }
        
        blockquote {
            border-left: 4px solid #3498db;
            padding-left: 20px;
            margin: 20px 0;
            font-style: italic;
            color: #555;
        }
        
        .metadata {
            background: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 30px;
            font-size: 14px;
        }
        
        .metadata-item {
            display: inline-block;
            margin-right: 20px;
            color: #7f8c8d;
        }
        
        .metadata-item strong {
            color: #2c3e50;
        }
        
        .excerpt {
            font-size: 1.1em;
            color: #555;
            line-height: 1.7;
            margin-bottom: 30px;
            padding: 20px;
            background: #f8f9fa;
            border-left: 4px solid #3498db;
        }
        
        .footnotes {
            margin-top: 50px;
            padding-top: 30px;
            border-top: 2px solid #ecf0f1;
        }
        
        .footnotes h2 {
            color: #2c3e50;
            font-size: 1.3em;
        }
        
        .footnote {
            margin-bottom: 15px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
        }
        
        .footnote-ref {
            font-weight: bold;
            color: #3498db;
            margin-right: 10px;
        }
        
        .citations {
            margin-top: 30px;
            padding-top: 30px;
            border-top: 2px solid #ecf0f1;
        }
        
        .citations h2 {
            color: #2c3e50;
            font-size: 1.3em;
        }
        
        .citation {
            margin-bottom: 15px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 4px;
        }
        
        .citation-text {
            font-style: italic;
            margin-bottom: 5px;
        }
        
        .citation-source {
            color: #7f8c8d;
            font-size: 0.9em;
        }
        
        .equations {
            margin-top: 30px;
            padding-top: 30px;
            border-top: 2px solid #ecf0f1;
        }
        
        .equations h2 {
            color: #2c3e50;
            font-size: 1.3em;
        }
        
        .equation {
            margin: 20px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 4px;
            overflow-x: auto;
        }
        
        .equation-label {
            font-weight: bold;
            color: #3498db;
            margin-bottom: 10px;
        }
        
        .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #ecf0f1;
            font-size: 12px;
            color: #7f8c8d;
            text-align: center;
        }
        
        a {
            color: #3498db;
            text-decoration: none;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        ul, ol {
            margin-bottom: 15px;
            padding-left: 30px;
        }
        
        li {
            margin-bottom: 5px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        
        table th, table td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        
        table th {
            background-color: #3498db;
            color: white;
        }
        
        table tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
        }
        
        pre {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
        
        .mjx-chtml {
            font-size: 1.1em !important;
        }
    </style>
    ${hasEquations ? `
    <script src="https://polyfill.io/v3/polyfill.min.js?features=es6"></script>
    <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
    <script>
        window.MathJax = {
            tex: {
                inlineMath: [['$', '$'], ['\\\\(', '\\\\)']],
                displayMath: [['$$', '$$'], ['\\\\[', '\\\\]']],
                processEscapes: true
            },
            options: {
                skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
            }
        };
    </script>` : ''}
</head>
<body>
    <div class="container">
        <h1>${postData.title || content.title}</h1>
        
        <div class="metadata">
            <span class="metadata-item"><strong>Word Count:</strong> ${content.wordCount}</span>
            ${content.documentType ? `<span class="metadata-item"><strong>Document Type:</strong> ${content.documentType === 'pdf' ? 'PDF' : 'Word Document'}</span>` : ''}
            <span class="metadata-item"><strong>Generated:</strong> ${new Date().toLocaleDateString()}</span>
            ${content.footnotes.length > 0 ? `<span class="metadata-item"><strong>Footnotes:</strong> ${content.footnotes.length}</span>` : ''}
            ${content.citations.length > 0 ? `<span class="metadata-item"><strong>Citations:</strong> ${content.citations.length}</span>` : ''}
            ${hasEquations ? `<span class="metadata-item"><strong>Equations:</strong> ${content.equations.length}</span>` : ''}
        </div>
        
        ${postData.excerpt || content.excerpt ? `
        <div class="excerpt">
            ${postData.excerpt || content.excerpt}
        </div>
        ` : ''}
        
        <div class="content">
            ${content.content}
        </div>
        
        ${content.footnotes.length > 0 ? `
        <div class="footnotes">
            <h2>Footnotes</h2>
            ${content.footnotes.map((footnote, index) => `
                <div class="footnote">
                    <span class="footnote-ref">[${index + 1}]</span>
                    ${footnote.text}
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${content.citations.length > 0 ? `
        <div class="citations">
            <h2>Citations</h2>
            ${content.citations.map(citation => `
                <div class="citation">
                    <div class="citation-text">"${citation.text}"</div>
                    ${citation.source ? `<div class="citation-source">— ${citation.source}</div>` : ''}
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        ${hasEquations ? `
        <div class="equations">
            <h2>Equations</h2>
            ${content.equations.map((equation, index) => `
                <div class="equation">
                    <div class="equation-label">Equation ${index + 1}</div>
                    <div>$$${equation.latex}$$</div>
                </div>
            `).join('')}
        </div>
        ` : ''}
        
        <div class="footer">
            <p>Generated by Word to WordPress Converter on ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>`;
        return htmlDoc;
    }
}
exports.LocalSaveService = LocalSaveService;
//# sourceMappingURL=LocalSaveService.js.map