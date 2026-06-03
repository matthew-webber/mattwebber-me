# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The Astro + MDX source for the static personal site `mattwebber.me`. Output is `output: 'static'` — there is no server runtime. Push to `main` triggers `.github/workflows/deploy.yml`, which builds with Node 22 and deploys `dist/` to GitHub Pages.

## Commands

```sh
npm run dev          # astro dev --open --host (hot reload, opens http://localhost:4321/)
npm run build        # astro build -> dist/
npm run preview      # serve the built dist/
npm run images:post  # process images from _image-inbox/ (see below)
```

There is no test suite, linter, or typechecker configured. `astro build` is the closest thing to a build check.

## Content model

Posts are **not** an Astro content collection. They are `.mdx` files in `src/content/posts/` discovered at build time via `import.meta.glob('.../content/posts/*.mdx', { eager: true })` in three places that must stay consistent: `src/pages/index.astro` (the feed), `src/pages/[slug]/index.astro` (per-post pages + prev/next nav), and `src/pages/rss/index.html.js` (the RSS feed).

Because there is no collection schema, frontmatter is validated only by usage. The fields that matter:

- `title`, `slug`, `date`, `description` — authored by hand. **`slug` controls the URL** (`my-post` → `/my-post/`); it is independent of the filename. Filenames are conventionally date-prefixed (`2026_05_19_memory-hooks.mdx`) for ordering on disk, but nothing reads the filename.
- `image`, `cardImage`, `ogImage`, `imageAlt` — written automatically by `scripts/post-image.mjs`; don't hand-edit unless you know why.

`date` is parsed as UTC everywhere (feed, RSS, per-post, OG image). Posts sort newest-first in the feed/RSS and oldest-first for prev/next computation.

MDX bodies can use raw HTML/JSX. The `UpdateBox` component (`src/components/UpdateBox.astro`) wraps a `.update-box` aside for post addenda.

## SEO / metadata

`src/layouts/BaseLayout.astro` is the single source of all `<head>` metadata: canonical URL, Open Graph, Twitter cards, and JSON-LD schema (switches between `Article` and `WebSite` based on the `type` prop). Per-post pages pass `type="article"` plus `publishedTime`/`modifiedTime`. If you add a metadata field to a post, thread it through `BaseLayout` props — pages don't emit their own `<head>` tags.

## Image pipeline (`scripts/post-image.mjs`)

`npm run images:post` is an interactive CLI:

1. Drop raw images into `_image-inbox/` (gitignored — originals stay local).
2. The script finds images, dedupes by SHA-256 against `_image-inbox/.processed.json`, and prompts you to attach each to a post.
3. For the chosen post it generates three derivatives into `public/content/images/posts/<slug>/` — a 1600px `hero-*.webp`, a 720×405 `card-*.webp`, and a 1200×630 `og-*.png` (background image + SVG text overlay of the title/description) — then rewrites the post's frontmatter image fields.

Flags: `-- --all` reprocesses already-seen images; passing explicit file paths processes just those.

**`sharp` is a runtime requirement of this script but is not in `package.json`** — it's loaded via dynamic `import` and the script tells you to `npm install -D sharp` if missing. Install it before running the pipeline.
