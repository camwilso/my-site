# cam-wilson.com

Personal site and blog. Built with [Astro](https://astro.build), deployed to GitHub Pages on every push to `main`.

## Writing a blog post

Add a markdown file to `src/content/blog/`:

```md
---
title: Post title
description: One-line summary shown on the blog index and in RSS.
date: 2026-08-08
image: /images/optional-header.jpg
---

Post body in markdown.
```

The filename becomes the URL: `src/content/blog/my-post.md` → `/blog/my-post`. Images go in `public/images/`.

## Commands

| Command           | Action                                   |
| :---------------- | :--------------------------------------- |
| `npm install`     | Install dependencies                     |
| `npm run dev`     | Dev server at `localhost:4321`           |
| `npm run build`   | Production build to `./dist/`            |
| `npm run preview` | Preview the production build locally     |

## Deployment

Cloudflare Pages builds and deploys on every push to `main` (build command `npm run build`, output directory `dist`). The custom domain and DNS are managed in the Cloudflare dashboard; the domain stays registered at Squarespace.
