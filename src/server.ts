import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'path';
import dotenv from 'dotenv';
import { DocumentProcessor, ProcessedContent } from './services/DocumentProcessor';
import { isPublishUiStatus, WordPressService } from './services/WordPressService';
import { LocalSaveService } from './services/LocalSaveService';
import { normalizeSimplificationSlug, SimplificationsService } from './services/SimplificationsService';
import { LivePublishPipelineService } from './services/LivePublishPipelineService';
import {
  LivePublishInput,
  parseLivePublishSource
} from './services/LivePublishLogService';
import {
  getProcessedContent,
  mergeProcessedContent,
  ProcessedContentOverlay,
  serializeImagesForClient,
  storeProcessedContent,
  updateProcessedContent
} from './services/ProcessedContentCache';
import { createError, errorHandler } from './middleware/errorHandler';
import { articleReviewService } from './services/ArticleReviewService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3007;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (process.env.NODE_ENV === 'production') {
      return callback(null, false);
    }
    // In development: allow any localhost port (root dev = 3006, client-only = 5173, etc.)
    if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware. Publish/save used to resend the whole processed
// document (HTML data-URIs + Buffer number arrays) and overflowed 50mb on
// large papers. Those routes now send a contentId + slim overlay; keep a
// higher limit as a fallback for older clients and other JSON endpoints.
const jsonBodyLimitMb = parseInt(process.env.JSON_BODY_LIMIT_MB || '256', 10);
app.use(express.json({ limit: `${jsonBodyLimitMb}mb` }));
app.use(express.urlencoded({ extended: true, limit: `${jsonBodyLimitMb}mb` }));

// File upload configuration
const storage = multer.memoryStorage();
const upload = multer({
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
    } else {
      cb(new Error('Only Word documents (.docx, .doc) and PDF files (.pdf) are allowed'));
    }
  }
});

// Services
const documentProcessor = new DocumentProcessor();
const wordpressService = new WordPressService();
const localSaveService = new LocalSaveService();
const simplificationsService = new SimplificationsService();
const livePublishPipeline = new LivePublishPipelineService();
const livePublishLog = livePublishPipeline.getLogService();

function resolveStoredContent(
  contentId: string | undefined,
  overlay?: ProcessedContentOverlay,
  fallback?: ProcessedContent
): ProcessedContent {
  const cached = getProcessedContent(contentId);
  if (cached) {
    return mergeProcessedContent(cached, overlay);
  }
  if (contentId) {
    throw createError(
      'Processed document expired or the server restarted. Please re-upload the document.',
      409
    );
  }
  if (fallback) {
    return fallback;
  }
  throw createError(
    'Processed document expired or the server restarted. Please re-upload the document.',
    409
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function livePublishInputFromBody(body: Record<string, unknown>, fallbackSource: 'publish' | 'replay' | 'manual'): LivePublishInput {
  return {
    slug: typeof body.slug === 'string' ? body.slug.trim() : '',
    title: optionalString(body.title),
    postId: optionalNumber(body.postId),
    postUrl: optionalString(body.postUrl),
    publishedAt: optionalString(body.publishedAt),
    source: parseLivePublishSource(body.source, fallbackSource)
  };
}

function resolveReplayInputs(body: Record<string, unknown>): LivePublishInput[] {
  const seen = new Set<string>();
  const inputs: LivePublishInput[] = [];

  const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === 'string') : [];
  for (const id of ids) {
    const prior = livePublishLog.findById(id);
    if (!prior) continue;
    const slug = prior.slug.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    inputs.push({
      slug,
      title: prior.title,
      postId: prior.postId,
      postUrl: prior.postUrl,
      publishedAt: prior.publishedAt,
      source: 'replay'
    });
  }

  const slugs = Array.isArray(body.slugs) ? body.slugs.filter((value): value is string => typeof value === 'string') : [];
  for (const raw of slugs) {
    const slug = raw.trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const prior = livePublishLog.findLatestBySlug(slug);
    inputs.push({
      slug,
      title: prior?.title,
      postId: prior?.postId,
      postUrl: prior?.postUrl,
      publishedAt: prior?.publishedAt,
      source: 'replay'
    });
  }

  return inputs;
}

function slugFromPublishedPost(post: { slug?: string; link?: string }): string {
  return normalizeSimplificationSlug(post.slug ?? '') || normalizeSimplificationSlug(post.link ?? '');
}

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
    const processedContent = await documentProcessor.processDocument(
      req.file.buffer, 
      req.file.originalname
    );

    const contentId = storeProcessedContent(processedContent);
    
    res.json({
      success: true,
      contentId,
      content: {
        ...processedContent,
        images: serializeImagesForClient(processedContent.images)
      },
      filename: req.file.originalname,
      fileType: processedContent.documentType
    });
  } catch (error) {
    next(error);
  }
});

// Publish to WordPress
app.post('/api/publish', async (req, res, next) => {
  const { contentId, content, wpConfig, postData } = req.body;
  let resolvedContent: ProcessedContent | undefined;
  
  try {
    console.log('Publish request received');
    console.log('Content id:', contentId);
    console.log('Content title:', content?.title);
    console.log('WordPress site:', wpConfig?.siteUrl);
    console.log('Post status:', postData?.status);

    if (!wpConfig || !postData || (!contentId && !content)) {
      console.error('Missing required data:', { contentId: !!contentId, content: !!content, wpConfig: !!wpConfig, postData: !!postData });
      return res.status(400).json({ error: 'Missing required data' });
    }

    if (postData.status != null && !isPublishUiStatus(postData.status)) {
      return res.status(400).json({ error: 'Post status must be draft, publish, private, or unlisted' });
    }

    if (postData.status === 'unlisted' && !(Number(postData.subjectCategoryId) > 0)) {
      return res.status(400).json({ error: 'Unlisted preview requires a subject category' });
    }

    resolvedContent = resolveStoredContent(contentId, content, contentId ? undefined : content);

    // Validate WordPress configuration
    if (!wpConfig.siteUrl || !wpConfig.username || !wpConfig.password) {
      console.error('WordPress configuration incomplete');
      return res.status(400).json({ error: 'WordPress configuration incomplete' });
    }

    console.log('Publishing to WordPress:', wpConfig.siteUrl);
    console.log('Username:', wpConfig.username);
    
    const result = await wordpressService.publishPost(resolvedContent, wpConfig, postData);
    
    console.log('Publish successful, post ID:', result.id);
    
    res.json({
      success: true,
      postId: result.id,
      postUrl: result.link,
      slug: slugFromPublishedPost(result),
      message: 'Post published successfully'
    });
  } catch (error: any) {
    console.error('Error in publish endpoint:', error);
    const errMsg = error?.message ?? '';
    // If it's a permission/rest_cannot_create error, try to save locally.
    // "not allowed to create posts" or "not allowed to create posts as this user" (wrong user/author).
    const isPermissionError =
      errMsg.includes('not allowed to create posts') ||
      errMsg.includes('rest_cannot_create') ||
      errMsg.includes('not currently logged in');
    if (isPermissionError && resolvedContent && postData) {
      try {
        console.log('WordPress permission denied, saving post locally...');
        const filename = await localSaveService.savePost(resolvedContent, postData);
        
        res.json({
          success: false,
          savedLocally: true,
          filename: filename,
          error: 'WordPress permission denied. Post saved locally for later publishing.',
          message: `Post saved as ${filename}. Please contact your WordPress admin to grant post creation permissions.`
        });
        return;
      } catch (saveError) {
        console.error('Failed to save locally:', saveError);
      }
    }
    
    next(error);
  }
});

// Save as HTML locally
app.post('/api/save-html', async (req, res, next) => {
  try {
    const { contentId, content, postData } = req.body;
    
    if (!postData || (!contentId && !content)) {
      return res.status(400).json({ error: 'Missing content or post data' });
    }

    const resolvedContent = resolveStoredContent(contentId, content, contentId ? undefined : content);
    const folderName = await localSaveService.savePostAsHtml(resolvedContent, postData);
    
    res.json({
      success: true,
      filename: folderName,
      message: `Post saved as HTML: ${folderName}/index.html`,
      location: path.join(process.cwd(), 'saved-posts', folderName)
    });
  } catch (error) {
    next(error);
  }
});

// List WordPress categories for the subject-category picker
app.post('/api/categories', async (req, res, next) => {
  try {
    const { wpConfig } = req.body;

    if (!wpConfig?.siteUrl || !wpConfig?.username || !wpConfig?.password) {
      return res.status(400).json({ error: 'WordPress configuration incomplete' });
    }

    const categories = await wordpressService.getCategories(wpConfig);
    res.json({ success: true, categories });
  } catch (error) {
    next(error);
  }
});

// Fetch posts from WordPress (single page)
app.post('/api/fetch-posts', async (req, res, next) => {
  try {
    const { wpConfig, options } = req.body;

    if (!wpConfig?.siteUrl || !wpConfig?.username || !wpConfig?.password) {
      return res.status(400).json({ error: 'WordPress configuration incomplete' });
    }

    const result = await wordpressService.fetchPosts(wpConfig, options || {});
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Fetch all posts and save them locally
app.post('/api/export-posts', async (req, res, next) => {
  try {
    const { wpConfig, options } = req.body;

    if (!wpConfig?.siteUrl || !wpConfig?.username || !wpConfig?.password) {
      return res.status(400).json({ error: 'WordPress configuration incomplete' });
    }

    console.log('Exporting posts from:', wpConfig.siteUrl, 'with filters:', options);

    const { posts, total } = await wordpressService.fetchAllPosts(
      wpConfig,
      options || {},
      (fetched, totalCount) => {
        console.log(`  Fetched ${fetched}/${totalCount} posts...`);
      }
    );

    const { folderName, postCount } = await localSaveService.saveFetchedPosts(posts, {
      source: wpConfig.siteUrl,
      filters: options || {},
    });

    res.json({
      success: true,
      folderName,
      postCount,
      total,
      message: `Exported ${postCount} posts to saved-posts/${folderName}/`,
    });
  } catch (error) {
    next(error);
  }
});

// Run inscience-v2 generate:simplifications for a published arthra slug
app.post('/api/generate-simplifications', async (req, res, next) => {
  try {
    const slug = typeof req.body?.slug === 'string' ? req.body.slug.trim() : '';
    if (!slug) {
      return res.status(400).json({ success: false, error: 'Missing slug' });
    }

    req.setTimeout(10 * 60 * 1000);
    const result = await simplificationsService.generateForSlug(slug);
    res.status(result.ok ? 200 : 500).json({
      success: result.ok,
      message: result.message,
      output: result.output || undefined,
      error: result.ok ? undefined : result.message
    });
  } catch (error) {
    next(error);
  }
});

// Generate simplifications + rebuild/redeploy inscience-v2, then append the processing log
app.post('/api/live-publish', async (req, res, next) => {
  try {
    const input = livePublishInputFromBody(req.body || {}, 'manual');
    if (!input.slug && !input.postUrl) {
      return res.status(400).json({ success: false, error: 'Missing slug' });
    }

    req.setTimeout(30 * 60 * 1000);
    const result = await livePublishPipeline.run(input);
    res.json({
      success: result.deploy.ok,
      simplifications: result.simplifications,
      deploy: result.deploy,
      entry: result.entry
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/live-publish-log', (req, res, next) => {
  try {
    res.json({ success: true, entries: livePublishLog.list() });
  } catch (error) {
    next(error);
  }
});

app.post('/api/live-publish/replay', async (req, res, next) => {
  try {
    const inputs = resolveReplayInputs(req.body || {});
    if (inputs.length === 0) {
      return res.status(400).json({ success: false, error: 'Provide slugs or log entry ids to replay' });
    }

    req.setTimeout(Math.max(30, 10 + inputs.length * 10) * 60 * 1000);
    const results = await livePublishPipeline.runMany(inputs);
    res.json({
      success: results.every((result) => result.deploy.ok),
      results
    });
  } catch (error) {
    next(error);
  }
});

// Which LLM providers/models are available for article review
app.get('/api/review-providers', (_req, res) => {
  res.json({ success: true, providers: articleReviewService.listProviders() });
});

// Delegate preview review to a configured LLM
app.post('/api/review-article', async (req, res, next) => {
  try {
    const { contentId, content, provider, model } = req.body || {};
    const { provider: resolvedProvider, model: resolvedModel } =
      articleReviewService.resolveSelection(provider, model);

    if (!contentId && !content) {
      return res.status(400).json({ error: 'Missing article to review' });
    }

    // Longer than the 5-minute outbound provider abort so that hop can return 504.
    req.setTimeout(6 * 60 * 1000);
    const resolved: Pick<
      ProcessedContent,
      'title' | 'excerpt' | 'content' | 'footnotes' | 'citations' | 'images'
    > = contentId
      ? resolveStoredContent(contentId, content)
      : {
          title: typeof content?.title === 'string' ? content.title : '',
          excerpt: typeof content?.excerpt === 'string' ? content.excerpt : '',
          content: typeof content?.content === 'string' ? content.content : '',
          footnotes: Array.isArray(content?.footnotes) ? content.footnotes : [],
          citations: Array.isArray(content?.citations) ? content.citations : [],
          images: Array.isArray(content?.images) ? content.images : [],
        };
    if (!resolved.title && !resolved.content) {
      return res.status(400).json({ error: 'Missing article to review' });
    }
    const result = await articleReviewService.review(
      {
        title: resolved.title,
        excerpt: resolved.excerpt,
        content: resolved.content,
        footnotes: resolved.footnotes,
        citations: resolved.citations,
        images: resolved.images.map((img) => ({
          id: img.id,
          filename: img.filename || img.id,
          alt: img.alt,
          title: img.title,
          caption: img.caption,
          data: img.data,
          contentType: img.contentType,
        })),
      },
      resolvedProvider,
      resolvedModel
    );

    if (typeof contentId === 'string' && contentId) {
      updateProcessedContent(contentId, {
        title: result.article.title,
        excerpt: result.article.excerpt,
        content: result.article.content,
        footnotes: result.article.footnotes,
        citations: result.article.citations,
        wordCount: result.article.content
          .replace(/<[^>]+>/g, ' ')
          .trim()
          .split(/\s+/)
          .filter(Boolean).length,
        images: result.article.images.map((img) => {
          const cached = resolved.images.find((item) => item.id === img.id);
          return {
            id: img.id,
            filename: img.filename,
            alt: img.alt,
            title: img.title,
            caption: img.caption,
            seoSource: 'ai' as const,
            contentType: cached?.contentType || 'image/webp',
          };
        }),
      });
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
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
  } catch (error) {
    next(error);
  }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Error handling middleware
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the leftover process from a previous npm run dev, or set PORT in .env.`
    );
    process.exit(1);
  }
  throw err;
}); 