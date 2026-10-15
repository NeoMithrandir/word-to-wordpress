# Graph Report - word-to-wordpress  (2026-09-18)

## Corpus Check
- 72 files · ~52,130 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 834 nodes · 1375 edges · 41 communities (35 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b4aed8bc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- server.ts
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Vite Migration - Final Steps
- Troubleshooting WordPress Posting (incl. Bitnami Lightsail)
- Testing Offline Mode
- Windows (PowerShell)
- WordPressService
- LivePublishPipelineService.ts
- App.tsx
- WordPressService.ts
- WordPressService
- LocalSaveService
- LivePublishLog.tsx
- wordpress.config.ts
- PostFetcher.tsx
- ProcessedContent

## God Nodes (most connected - your core abstractions)
1. `DocumentProcessor` - 24 edges
2. `PdfProcessor` - 21 edges
3. `WordPressService` - 21 edges
4. `compilerOptions` - 16 edges
5. `ProcessedContent` - 16 edges
6. `ProcessedPostsImporter` - 16 edges
7. `Word to WordPress Converter` - 16 edges
8. `PublishSettings()` - 15 edges
9. `compilerOptions` - 14 edges
10. `ContentPreview()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `ContentPreviewProps` --references--> `ProcessedContent`  [EXTRACTED]
  client/src/components/ContentPreview.tsx → client/src/App.tsx
- `DocumentUploadProps` --references--> `ProcessedContent`  [EXTRACTED]
  client/src/components/DocumentUpload.tsx → client/src/App.tsx
- `PublishSettingsProps` --references--> `ProcessedContent`  [EXTRACTED]
  client/src/components/PublishSettings.tsx → client/src/App.tsx
- `SitePublishResult` --references--> `PublishSiteId`  [EXTRACTED]
  client/src/App.tsx → client/src/config/wordpress.config.ts
- `toPublishOverlay()` --calls--> `stripImageDataUris()`  [EXTRACTED]
  client/src/App.tsx → client/src/lib/reviewHtml.ts

## Import Cycles
- None detected.

## Communities (41 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.16
Nodes (21): Citation, Footnote, ProcessedImage, ArticleReviewResponse, ContentPreview(), imageSeoSourceLabel(), isReviewProviderId(), listedModelId() (+13 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (42): $, captionTextForImage(), figureIdFromCaption(), figureTargetForImage(), isInsideAnchor(), linkFigureReferences(), alreadyFigure, first (+34 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (14): CategoryTarget, mapCategoryToTarget(), NAME_MIGRATION, SLUG_MIGRATION, defaultProcessedDir(), main(), parseArgs(), FeaturedMediaOutcome (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (29): cheerio, cors, dotenv, express, express-rate-limit, form-data, helmet, jszip (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (43): concurrently, cross-env, nodemon, author, description, devDependencies, concurrently, cross-env (+35 more)

### Community 5 - "Community 5"
Cohesion: 0.27
Nodes (9): App(), livePublishHttpError(), toPublishOverlay(), overallConnectionStatus(), publicArticleUrl(), resolvePublishSites(), SHARED_AUTH, WORDPRESS_SITES (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (21): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (21): client, dist, ES2020, node_modules, compilerOptions, declaration, declarationMap, esModuleInterop (+13 more)

### Community 8 - "server.ts"
Cohesion: 0.17
Nodes (4): Citation, Equation, Footnote, PdfProcessor

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (33): dependencies, axios, react, react-dom, react-dropzone, devDependencies, @types/node, @types/react (+25 more)

### Community 10 - "Community 10"
Cohesion: 0.15
Nodes (22): PostSettings, PublishOutcome, allowsUnlistedPreview(), categoriesLabel(), CONTENT_TYPE_OPTIONS, deployLabel(), DESTINATION_OPTIONS, destinationIncludesArthra() (+14 more)

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (40): 1. Enable REST API, 2. Create Application Password, 3. Test Your Setup, 🙏 Acknowledgments, 🔧 Advanced Configuration, 🛠️ API Reference, 🏗️ Architecture, Backend (Node.js/TypeScript) (+32 more)

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (48): GREEK_CHAR_MAP, toLatinSlug(), createError(), haikuBody, images, kept, png, prompt (+40 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (23): 1. Document Processing, 2. Style Mappings, 3. LaTeX Conversion, 4. WordPress Integration, Common Issues, CSS Styling, Debug Information, Equation and Formula Handling (+15 more)

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 15 - "Community 15"
Cohesion: 0.47
Nodes (5): apiUrl(), authHeaders(), axios, checkUserPermissions(), config

### Community 16 - "Community 16"
Cohesion: 0.60
Nodes (4): extractBase64Images(), ExtractResult, main(), mimeToExt()

### Community 27 - "Vite Migration - Final Steps"
Cohesion: 0.12
Nodes (16): Available Scripts, Current Status, Files Modified, Files Removed, If port 3000 is in use:, If you get esbuild errors:, Next Steps (Optional), Step 1: Close All Terminals (+8 more)

### Community 28 - "Troubleshooting WordPress Posting (incl. Bitnami Lightsail)"
Cohesion: 0.12
Nodes (15): 1. Confirm the client sends the Authorization header, 2. Confirm the server receives the header (optional), Bitnami (Lightsail): Is .htaccess used? Where to put the fix?, Check whether headers contain what’s needed, Fix: Apache passing the Authorization header, If SetEnvIf didn’t work (PHP-FPM / FastCGI), Option 1: CGIPassAuth on (try this first), Option 2: RewriteRule in the htaccess conf (+7 more)

### Community 29 - "Testing Offline Mode"
Cohesion: 0.18
Nodes (10): 1. **Non-blocking WordPress Connection Check**, 2. **Connection Status Indicators**, 3. **Graceful Degradation**, 4. **User Experience**, Benefits, Features Added, Overview, Technical Implementation (+2 more)

### Community 30 - "Windows (PowerShell)"
Cohesion: 0.29
Nodes (6): After Killing Processes, How to Restart the Servers, Option 1: Kill All Node Processes, Option 2: Kill Specific Port, Option 3: Use Different Ports, Windows (PowerShell)

### Community 32 - "LivePublishPipelineService.ts"
Cohesion: 0.05
Nodes (54): AppError, errorHandler(), main(), pipelineWith(), RecordingDeployService, RecordingLogService, RecordingSimplificationsService, app (+46 more)

### Community 33 - "App.tsx"
Cohesion: 0.12
Nodes (16): AppPage, ArticleAcfSettings, ArticleContentType, ArticleFaqEntry, DeployResult, DeployStatus, Equation, ImageSeoSource (+8 more)

### Community 34 - "WordPressService.ts"
Cohesion: 0.08
Nodes (32): buildAnchorPattern(), dashToMinus(), decodeNumericEntities(), decodeNumericEntity(), decodeXmlEntities(), EquationPlacementResult, escapeRegExp(), expandBareLatexRange() (+24 more)

### Community 35 - "WordPressService"
Cohesion: 0.06
Nodes (36): buildNumberedBibliography(), renderFootnoteTokens(), baseContent, spawnOpts, ArticleReviewArticle, ArticleReviewInput, ProcessedContent, ProcessedImage (+28 more)

### Community 36 - "LocalSaveService"
Cohesion: 0.08
Nodes (36): BibliographyCitation, BibliographyEntry, extractAllSurnames(), InTextCite, isBibliographyHeading(), isFigureLikeParen(), linkBibliographyCitations(), LinkedBibliographyCitation (+28 more)

### Community 37 - "LivePublishLog.tsx"
Cohesion: 0.26
Nodes (11): apiErrorMessage(), formatTimestamp(), LivePublishLog(), LivePublishLogEntry, LivePublishSource, LivePublishStepResult, LogState, sourceLabel() (+3 more)

### Community 38 - "wordpress.config.ts"
Cohesion: 0.21
Nodes (13): resolveStoredContent(), restoreImageDataUris(), ImageSeoSource, cache, CacheEntry, getProcessedContent(), ImageMetaOverlay, mergeImageMeta() (+5 more)

### Community 42 - "PostFetcher.tsx"
Cohesion: 0.33
Nodes (5): ExportResult, FetchedPostSummary, FetchFilters, FetchState, PostFetcher()

### Community 44 - "ProcessedContent"
Cohesion: 0.50
Nodes (4): ProcessedContent, ContentPreviewProps, DocumentUpload(), DocumentUploadProps

## Knowledge Gaps
- **332 isolated node(s):** `axios`, `config`, `name`, `version`, `private` (+327 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 3` to `Community 4`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `jszip` connect `Community 3` to `WordPressService.ts`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `DocumentProcessor` connect `WordPressService.ts` to `LivePublishPipelineService.ts`, `Community 1`, `server.ts`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **What connects `axios`, `config`, `name` to the rest of the system?**
  _332 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06708595387840671 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1032258064516129 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._