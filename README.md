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

## Publish

Push to `main`. GitHub Actions builds Astro and deploys the `dist/` output to GitHub Pages.
