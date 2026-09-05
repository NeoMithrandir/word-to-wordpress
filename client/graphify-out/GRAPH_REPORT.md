# Graph Report - client  (2026-08-30)

## Corpus Check
- 16 files · ~9,267 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 150 nodes · 203 edges · 12 communities (11 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `07931c24`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- compilerOptions
- PublishSettings.tsx
- package.json
- Vite Migration - Final Steps
- devDependencies
- LivePublishLog.tsx
- manifest.json
- PostFetcher.tsx
- WordPressConfig.tsx

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `PublishSettings()` - 10 edges
3. `Vite Migration - Final Steps` - 10 edges
4. `ProcessedContent` - 7 edges
5. `PublishSettingsProps` - 7 edges
6. `resolvePublishSites()` - 6 edges
7. `scripts` - 5 edges
8. `LivePublishLog()` - 5 edges
9. `PublishSiteId` - 5 edges
10. `PublishDestination` - 5 edges

## Surprising Connections (you probably didn't know these)
- `ContentPreviewProps` --references--> `ProcessedContent`  [EXTRACTED]
  src/components/ContentPreview.tsx → src/App.tsx
- `DocumentUploadProps` --references--> `ProcessedContent`  [EXTRACTED]
  src/components/DocumentUpload.tsx → src/App.tsx
- `PublishSettingsProps` --references--> `ProcessedContent`  [EXTRACTED]
  src/components/PublishSettings.tsx → src/App.tsx
- `SitePublishResult` --references--> `PublishSiteId`  [EXTRACTED]
  src/App.tsx → src/config/wordpress.config.ts
- `ContentPreview()` --calls--> `toLatinSlug()`  [EXTRACTED]
  src/components/ContentPreview.tsx → src/lib/latinSlug.ts

## Import Cycles
- None detected.

## Communities (12 total, 1 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.13
Nodes (21): App(), AppPage, Citation, DeployResult, DeployStatus, Equation, Footnote, ProcessedContent (+13 more)

### Community 1 - "compilerOptions"
Cohesion: 0.09
Nodes (21): dom, dom.iterable, esnext, src, compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop (+13 more)

### Community 2 - "PublishSettings.tsx"
Cohesion: 0.15
Nodes (20): PostSettings, PublishOutcome, SitePublishResult, deployLabel(), DESTINATION_OPTIONS, destinationLabel(), publishButtonLabel(), PublishSettings() (+12 more)

### Community 3 - "package.json"
Cohesion: 0.11
Nodes (18): axios, dependencies, axios, react, react-dom, react-dropzone, name, private (+10 more)

### Community 4 - "Vite Migration - Final Steps"
Cohesion: 0.12
Nodes (16): Available Scripts, Current Status, Files Modified, Files Removed, If port 3000 is in use:, If you get esbuild errors:, Next Steps (Optional), Step 1: Close All Terminals (+8 more)

### Community 5 - "devDependencies"
Cohesion: 0.13
Nodes (15): devDependencies, @types/node, @types/react, @types/react-dom, typescript, vite, vite-tsconfig-paths, @vitejs/plugin-react (+7 more)

### Community 6 - "LivePublishLog.tsx"
Cohesion: 0.31
Nodes (8): formatTimestamp(), LivePublishLog(), LivePublishLogEntry, LivePublishSource, LivePublishStepResult, LogState, sourceLabel(), stepLabel()

### Community 7 - "manifest.json"
Cohesion: 0.25
Nodes (7): background_color, display, icons, name, short_name, start_url, theme_color

### Community 8 - "PostFetcher.tsx"
Cohesion: 0.33
Nodes (5): ExportResult, FetchedPostSummary, FetchFilters, FetchState, PostFetcher()

## Knowledge Gaps
- **76 isolated node(s):** `name`, `version`, `private`, `type`, `axios` (+71 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `devDependencies` to `package.json`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _76 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.12666666666666668 - nodes in this community are weakly interconnected._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._
- **Should `Vite Migration - Final Steps` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._