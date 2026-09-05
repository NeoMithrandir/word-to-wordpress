# Graph Report - word-to-wordpress  (2026-08-30)

## Corpus Check
- 62 files · ~40,296 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 711 nodes · 1113 edges · 35 communities (28 shown, 7 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.7)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `07931c24`
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
- WordPressService
- LivePublishLog.tsx

## God Nodes (most connected - your core abstractions)
1. `DocumentProcessor` - 28 edges
2. `PdfProcessor` - 21 edges
3. `WordPressService` - 19 edges
4. `compilerOptions` - 16 edges
5. `ProcessedContent` - 16 edges
6. `ProcessedPostsImporter` - 16 edges
7. `Word to WordPress Converter` - 16 edges
8. `compilerOptions` - 14 edges
9. `LocalSaveService` - 13 edges
10. `PublishSettings()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `ContentPreviewProps` --references--> `ProcessedContent`  [EXTRACTED]
  client/src/components/ContentPreview.tsx → client/src/App.tsx
- `DocumentUploadProps` --references--> `ProcessedContent`  [EXTRACTED]
  client/src/components/DocumentUpload.tsx → client/src/App.tsx
- `SitePublishResult` --references--> `PublishSiteId`  [EXTRACTED]
  client/src/App.tsx → client/src/config/wordpress.config.ts
- `applyReviewToArticle()` --calls--> `toLatinSlug()`  [EXTRACTED]
  src/services/ArticleReviewService.ts → src/lib/latinSlug.ts
- `resolveStoredContent()` --calls--> `createError()`  [EXTRACTED]
  src/server.ts → src/middleware/errorHandler.ts

## Import Cycles
- None detected.

## Communities (35 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (66): App(), AppPage, Citation, DeployResult, DeployStatus, Equation, Footnote, ImageSeoSource (+58 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (55): GREEK_CHAR_MAP, toLatinSlug(), alreadyFigure, first, fromAlt, fromCaption, fromHeading, fromTitle (+47 more)

### Community 2 - "Community 2"
Cohesion: 0.10
Nodes (14): CategoryTarget, mapCategoryToTarget(), NAME_MIGRATION, SLUG_MIGRATION, defaultProcessedDir(), main(), parseArgs(), FeaturedMediaOutcome (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (29): cheerio, cors, dotenv, express, express-rate-limit, form-data, helmet, jszip (+21 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (43): concurrently, cross-env, nodemon, author, description, devDependencies, concurrently, cross-env (+35 more)

### Community 6 - "Community 6"
Cohesion: 0.09
Nodes (21): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (21): client, dist, ES2020, node_modules, compilerOptions, declaration, declarationMap, esModuleInterop (+13 more)

### Community 8 - "server.ts"
Cohesion: 0.06
Nodes (36): AppError, errorHandler(), app, documentProcessor, jsonBodyLimitMb, limiter, livePublishInputFromBody(), livePublishLog (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (33): dependencies, axios, react, react-dom, react-dropzone, devDependencies, @types/node, @types/react (+25 more)

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (4): Citation, Equation, Footnote, PdfProcessor

### Community 11 - "Community 11"
Cohesion: 0.05
Nodes (40): 1. Enable REST API, 2. Create Application Password, 3. Test Your Setup, 🙏 Acknowledgments, 🔧 Advanced Configuration, 🛠️ API Reference, 🏗️ Architecture, Backend (Node.js/TypeScript) (+32 more)

### Community 12 - "Community 12"
Cohesion: 0.10
Nodes (35): createError(), images, png, restored, stripped, allowlistedIds(), ANTHROPIC_MODELS, anthropicKey() (+27 more)

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
Cohesion: 0.08
Nodes (29): slugFromPublishedPost(), DeployRunResult, deploySpec(), InscienceV2DeployService, InscienceV2DeployTarget, lastNonEmptyLine(), parseDeployTarget(), runDeploy() (+21 more)

### Community 35 - "WordPressService"
Cohesion: 0.20
Nodes (4): ProcessedImage, imageDataToBuffer(), isWordPressSlugConflict(), WordPressService

### Community 37 - "LivePublishLog.tsx"
Cohesion: 0.27
Nodes (10): apiErrorMessage(), formatTimestamp(), LivePublishLog(), LivePublishLogEntry, LivePublishSource, LivePublishStepResult, LogState, sourceLabel() (+2 more)

## Knowledge Gaps
- **295 isolated node(s):** `axios`, `config`, `name`, `version`, `private` (+290 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DocumentProcessor` connect `Community 5` to `server.ts`, `Community 1`, `Community 10`?**
  _High betweenness centrality (0.105) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Community 3` to `Community 4`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `jszip` connect `Community 3` to `Community 5`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **What connects `axios`, `config`, `name` to the rest of the system?**
  _295 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05487269534679543 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1032258064516129 - nodes in this community are weakly interconnected._