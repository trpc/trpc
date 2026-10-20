import { NodeServices } from '@effect/platform-node';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { Effect, FileSystem } from 'effect';
import { defineConfig } from 'vite-plus';

import { blogContent, blogPosts } from './build/blog-content.ts';
import { docPages, docsContent } from './build/content.ts';
import { decisionsContent } from './build/decisions-content.ts';
import { blogFeeds } from './build/feeds.ts';
import { siteIcons } from './build/icons.ts';
import { bundledServer } from './build/on-demand.ts';
import { OgCard, ogImages } from './build/og-image.ts';
import {
  cacheDir,
  decisionsOptions,
  samplesDir,
  twoslashCache,
} from './build/paths.ts';
import { absoluteUrl, postDate, trpcPageUrl, trpcPostUrl } from './src/seo.ts';
import {
  blog,
  type CopiedVersion,
  copiedVersions,
  decisions,
  sections,
  site,
  v12,
} from './src/site.ts';
import v9Sections from './v9/sections.json' with { type: 'json' };
import v10Sections from './v10/sections.json' with { type: 'json' };
import v11Sections from './v11/sections.json' with { type: 'json' };

// The v12 docs, served at `/v12/docs`.
const contentDir = new URL('docs', import.meta.url).pathname;
// A copy of trpc.io's blog (`build/old-docs-copy.ts`), served at `/blog`.
const blogDir = new URL('blog', import.meta.url).pathname;
// Copies of the older versions' docs (`build/old-docs-copy.ts`), served at
// `/docs` (v11, the stable release), `/v10/docs` and `/v9/docs`.
const copiedSections = { v9: v9Sections, v10: v10Sections, v11: v11Sections };
const copies = copiedVersions.map((version) => ({
  dir: new URL(`${version.id}/docs`, import.meta.url).pathname,
  sections: copiedSections[version.id],
  version,
}));
const v11Dir = new URL('v11/docs', import.meta.url).pathname;
const faviconFile = new URL('public/favicon.svg', import.meta.url).pathname;
const [pages, copiedPages, posts, favicon] = await Effect.runPromise(
  Effect.all([
    docPages({
      basePath: v12.basePath,
      contentDir,
      datesSkipRenames: true,
      samplesDir,
    }),
    Effect.forEach(copies, (copy) =>
      Effect.map(
        docPages({
          basePath: copy.version.basePath,
          contentDir: copy.dir,
          samplesDir,
        }),
        (found) => ({ pages: found, version: copy.version }),
      ),
    ),
    blogPosts(blogDir),
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readFileString(faviconFile);
    }),
  ]).pipe(Effect.provide(NodeServices.layer)),
);
const docCard = (
  page: (typeof pages)[number],
  version: 'v12' | CopiedVersion['id'],
  url: string,
) =>
  OgCard.Doc({
    description: page.description,
    path: page.path,
    section: page.section,
    title: page.title,
    url,
    version,
  });

export default defineConfig({
  define: {
    // The environment the Experiments menu names (`src/flags.ts`).
    'import.meta.env.VERCEL_ENV': JSON.stringify(
      process.env['VERCEL_ENV'] ?? '',
    ),
  },
  // The prerender fetches each page from this server in the build's own
  // process. `localhost` binds `::1` only, and a render that holds the event
  // loop past Node's 250ms per-address connect timer turns the fetch into
  // `ETIMEDOUT ::1`, then `ECONNREFUSED 127.0.0.1`; an IP has one address.
  preview: { host: '127.0.0.1' },
  plugins: [
    docsContent({
      agentFiles: true,
      basePath: v12.basePath,
      contentDir,
      contentPath: 'www/docs',
      datesSkipRenames: true,
      manifestId: 'virtual:docs-manifest',
      samplesDir,
      sections,
      siteUrl: site.url,
      sourceUrl: site.sourceUrl,
      summary: site.description,
      twoslashCache,
      v11Dir,
    }),
    ...copies.map((copy) =>
      docsContent({
        agentFiles: false,
        basePath: copy.version.basePath,
        contentDir: copy.dir,
        // trpc.io compiled v11's blocks with Twoslash, and so does the site.
        inlineApp: copy.version.id === 'v11' ? 'v11' : undefined,
        manifestId: `virtual:${copy.version.id}-docs-manifest`,
        samplesDir,
        sections: copy.sections,
        siteUrl: site.url,
        // trpc.io's home page's intro, which the home page shows for v11.
        snippetsDir:
          copy.version.id === 'v11'
            ? new URL('v11/home', import.meta.url).pathname
            : undefined,
        sourceUrl: `${site.github}/blob/main/www`,
        summary: site.description,
        twoslashCache: copy.version.id === 'v11' ? twoslashCache : undefined,
      }),
    ),
    blogContent({
      contentDir: blogDir,
      manifestId: 'virtual:blog-manifest',
      samplesDir,
      sourceUrl: `${site.github}/blob/main/www`,
    }),
    blogFeeds({ posts }),
    decisionsContent(decisionsOptions),
    siteIcons({ svg: favicon }),
    ogImages({
      cacheDir: `${cacheDir}/og`,
      cards: [
        OgCard.Home({ path: '/' }),
        ...pages.map((page) => docCard(page, 'v12', absoluteUrl(page.path))),
        ...copiedPages.flatMap((copy) =>
          copy.pages.map((page) =>
            docCard(
              page,
              copy.version.id,
              trpcPageUrl(
                copy.version,
                page.path.slice(`${copy.version.basePath}/`.length),
              ),
            ),
          ),
        ),
        OgCard.Post({
          description: blog.description,
          eyebrow: '',
          path: '/blog',
          title: `The ${site.name} blog`,
          url: absoluteUrl('/blog'),
        }),
        ...posts.map((post) =>
          OgCard.Post({
            description: post.description,
            eyebrow: `${postDate(post.date)} · ${post.authors.map((author) => author.name).join(', ')}`,
            path: `/blog/${post.slug}`,
            title: post.title,
            url: trpcPostUrl(post.slug),
          }),
        ),
      ],
    }),
    tailwindcss(),
    bundledServer(),
    tanstackStart({
      pages: [
        { path: '/', sitemap: { changefreq: 'weekly', priority: 1 } },
        ...pages.map((page) => ({
          path: page.path,
          // An experiment's page is `noindex`.
          sitemap:
            page.experiment === undefined
              ? {
                  changefreq: 'weekly' as const,
                  lastmod: page.lastModified,
                  priority: 0.8,
                }
              : { exclude: true },
        })),
        // trpc.io is where the older versions' docs are found; each page's
        // canonical link points there.
        ...copiedPages.flatMap((copy) =>
          copy.pages.map((page) => ({
            path: page.path,
            sitemap: { exclude: true },
          })),
        ),
        { path: '/blog', sitemap: { changefreq: 'monthly', priority: 0.5 } },
        // Like the older versions' pages, each post's canonical link points
        // at trpc.io.
        ...posts.map((post) => ({
          path: `/blog/${post.slug}`,
          sitemap: { exclude: true },
        })),
        // Hidden: nothing links here, so the crawl starts here, and finds
        // each question and decision from it, out of the sitemap.
        { path: decisions.basePath, sitemap: { exclude: true } },
        {
          path: '/404',
          prerender: { enabled: true, outputPath: '/404.html' },
          sitemap: { exclude: true },
        },
      ],
      prerender: {
        crawlLinks: true,
        enabled: true,
        failOnError: true,
        filter: (page) => {
          const prerendered =
            page.path !== v12.basePath &&
            copiedVersions.every((version) => page.path !== version.basePath) &&
            // An index route (`/blog/`) is found with its slash, which the
            // host redirects away.
            (page.path === '/' || !page.path.endsWith('/')) &&
            // A query (`?flags=`, `?version=v12`) is rendered on request
            // (`build/on-demand.ts`), not once per combination here.
            !/[?#]/.test(page.path);
          // Crawling (which checks that every link resolves) and route
          // discovery add more than the pages listed above: anchors,
          // markdown and redirects, which would otherwise join the sitemap.
          if (page.fromCrawl || !prerendered) {
            page.sitemap = { ...page.sitemap, exclude: true };
          }
          return prerendered;
        },
      },
      sitemap: { enabled: true, host: site.url },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
