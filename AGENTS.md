## Learned User Preferences

- On Word-to-WordPress publish, do not embed images as base64; convert them to WebP, resize only when a side exceeds 1200px, and leave smaller images at native size.
- Keep the preview step editable: title, slug, excerpt, footnotes, bibliography, and image filename, alt text, and caption before continue-to-publish.
- Published slugs must be Latin/ASCII kebab-case (Greek transliterated) so URLs are easy to share; do not rewrite slugs when updating an existing post.
- Converter images should get SEO filenames and descriptive alt from nearby heading, caption, or title (Latin kebab filenames), not sequential `image-N`; use AI vision only when that context is missing.

## Learned Workspace Facts

- This app publishes to WordPress only. The public site is the sibling `inscience-v2` Astro app, which reads `arthra.inscience.gr` GraphQL at build time and must be rebuilt separately.
- The last publish step can target `inscience.gr` (legacy), `arthra.inscience.gr` (v2 CMS), or both. Upload can set WordPress status to draft, publish, or private.
- Simple-language AI review lives in inscience-v2 (`generate:simplifications`). This repo runs it after a successful public publish to arthra, not for drafts or inscience.gr-only posts. Override the sibling path with `INSCIENCE_V2_DIR`.
- After that public arthra publish, this repo also rebuilds/redeploys inscience-v2 (`npm run deploy:cloudflare` from the sibling checkout; `INSCIENCE_V2_DEPLOY=vercel` for `npx vercel --prod --yes`). Attempts are appended to `saved-posts/live-publish-log.json` and can be replayed from the Live Publish page (or by pushing a slug published outside this tool).
- arthra was seeded by this repo's fetch plus `import-processed-posts.ts`; CMS setup and shortcode cleanup live in inscience-v2. There is no ongoing seeder.
- `PostFetcher` can pull existing WordPress posts (including taxonomies and featured images) into `saved-posts/` for offline batch updates.
- New publishes send WordPress a Latin slug from `toLatinSlug`; the live-publish pipeline still accepts encoded Greek slugs so older posts can be replayed.
- inscience-v2 is fully static and only builds published arthra posts; WordPress drafts never appear on the live site, and this app's ContentPreview is not the Astro article template.
