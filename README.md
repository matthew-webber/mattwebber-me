# mattwebber.me

Astro + MDX source for `mattwebber.me`.

## Write a post

Create a new `.mdx` file in `src/content/posts/`:

```mdx
---
title: My Post
slug: my-post
date: 2026-05-19
description: Short summary for cards, RSS, and social previews.
---

Normal Markdown works here.

<div className="note-box">
  Raw HTML and MDX components work too.
</div>
```

The `slug` controls the URL: `my-post` becomes `/my-post/`.

## Develop

```sh
npm install
npm run dev
```

To start Astro and open the local site in your browser automatically:

```sh
npm run dev
```

Astro keeps hot reload enabled during development and opens the actual local dev server URL, typically `http://localhost:4321/`.

## Add post images

Drop raw screenshots or downloaded images into `_image-inbox/`. That directory is ignored by git, so the original large files stay local.

Then run:

```sh
npm run images:post
```

The script detects new images by SHA, asks which post to attach each image to, generates a hero image, feed card image, and social share image, then updates the post frontmatter. Reprocess already-seen images with:

```sh
npm run images:post -- --all
```

## Publish

Push to `main`. GitHub Actions builds Astro and deploys the `dist/` output to GitHub Pages.
