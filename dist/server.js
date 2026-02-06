"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const DocumentProcessor_1 = require("./services/DocumentProcessor");
const WordPressService_1 = require("./services/WordPressService");
const LocalSaveService_1 = require("./services/LocalSaveService");
const errorHandler_1 = require("./middleware/errorHandler");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3007;
// Security middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production' ? false : 'http://localhost:3006',
    credentials: true
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);
// Body parsing middleware
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// File upload configuration
const storage = multer_1.default.memoryStorage();
const upload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: (parseInt(process.env.UPLOAD_LIMIT_MB || '128')) * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
            'application/msword', // .doc
            'application/pdf' // .pdf
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Only Word documents (.docx, .doc) and PDF files (.pdf) are allowed'));
        }
    }
});
// Services
const documentProcessor = new DocumentProcessor_1.DocumentProcessor();
const wordpressService = new WordPressService_1.WordPressService();
const localSaveService = new LocalSaveService_1.LocalSaveService();
// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});
// Upload and process document
app.post('/api/upload', upload.single('document'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No document uploaded' });
        }
        console.log('Processing document:', req.file.originalname);
        console.log('File type:', req.file.mimetype);
        console.log('File size:', req.file.size, 'bytes');
        // Process the document with filename for type detection
        const processedContent = await documentProcessor.processDocument(req.file.buffer, req.file.originalname);
        res.json({
            success: true,
            content: processedContent,
            filename: req.file.originalname,
            fileType: processedContent.documentType
        });
    }
    catch (error) {
        next(error);
    }
});
// Publish to WordPress
app.post('/api/publish', async (req, res, next) => {
    const { content, wpConfig, postData } = req.body;
    try {
        console.log('Publish request received');
        console.log('Content title:', content?.title);
        console.log('WordPress site:', wpConfig?.siteUrl);
        console.log('Post status:', postData?.status);
        if (!content || !wpConfig || !postData) {
            console.error('Missing required data:', { content: !!content, wpConfig: !!wpConfig, postData: !!postData });
            return res.status(400).json({ error: 'Missing required data' });
        }
        // Validate WordPress configuration
        if (!wpConfig.siteUrl || !wpConfig.username || !wpConfig.password) {
            console.error('WordPress configuration incomplete');
            return res.status(400).json({ error: 'WordPress configuration incomplete' });
        }
        console.log('Publishing to WordPress:', wpConfig.siteUrl);
        console.log('Username:', wpConfig.username);
        const result = await wordpressService.publishPost(content, wpConfig, postData);
        console.log('Publish successful, post ID:', result.id);
        res.json({
            success: true,
            postId: result.id,
            postUrl: result.link,
            message: 'Post published successfully'
        });
    }
    catch (error) {
        console.error('Error in publish endpoint:', error);
        // If it's a permission error, try to save locally
        if (error.message && error.message.includes('not allowed to create posts') && content && postData) {
            try {
                console.log('WordPress permission denied, saving post locally...');
                const filename = await localSaveService.savePost(content, postData);
                res.json({
                    success: false,
                    savedLocally: true,
                    filename: filename,
                    error: 'WordPress permission denied. Post saved locally for later publishing.',
                    message: `Post saved as ${filename}. Please contact your WordPress admin to grant post creation permissions.`
                });
                return;
            }
            catch (saveError) {
                console.error('Failed to save locally:', saveError);
            }
        }
        next(error);
    }
});
// Save as HTML locally
app.post('/api/save-html', async (req, res, next) => {
    try {
        const { content, postData } = req.body;
        if (!content || !postData) {
            return res.status(400).json({ error: 'Missing content or post data' });
        }
        const folderName = await localSaveService.savePostAsHtml(content, postData);
        res.json({
            success: true,
            filename: folderName,
            message: `Post saved as HTML: ${folderName}/index.html`,
            location: path_1.default.join(process.cwd(), 'saved-posts', folderName)
        });
    }
    catch (error) {
        next(error);
    }
});
// Test WordPress connection
app.post('/api/test-connection', async (req, res, next) => {
    try {
        const { wpConfig } = req.body;
        if (!wpConfig || !wpConfig.siteUrl || !wpConfig.username || !wpConfig.password) {
            return res.status(400).json({ error: 'WordPress configuration incomplete' });
        }
        const isConnected = await wordpressService.testConnection(wpConfig);
        res.json({
            success: true,
            connected: isConnected,
            message: isConnected ? 'Connection successful' : 'Connection failed'
        });
    }
    catch (error) {
        next(error);
    }
});
// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express_1.default.static(path_1.default.join(__dirname, '../client/build')));
    app.get('*', (req, res) => {
        res.sendFile(path_1.default.join(__dirname, '../client/build/index.html'));
    });
}
// Error handling middleware
app.use(errorHandler_1.errorHandler);
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
//# sourceMappingURL=server.js.map