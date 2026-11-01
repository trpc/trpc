import { NodeServices } from '@effect/platform-node';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { Effect, FileSystem } from 'effect';
import { defineConfig } from 'vite';

import { referenceSection } from './api-reference/convert.ts';
import { blogContent, blogPosts } from './build/blog-content.ts';
import { docPages, docsContent } from './build/content.ts';
import { blogFeeds } from './build/feeds.ts';
import { siteIcons } from './build/icons.ts';
import { bundledServer } from './build/on-demand.ts';
import { ogCards } from './build/og-cards.ts';
import {
  sentryDefines,
  sentrySettings,
  sentryUploadPlugins,
} from './build/sentry.ts';
import { siteFiles } from './build/site-files.ts';
import { samplesDir, twoslashCache } from './build/paths.ts';
import { mediaAssets } from './src/media-assets.ts';
import type { DocCard } from './src/og/card.ts';
import { mediaPage, searchPage } from './src/pages.ts';
import { absoluteUrl, copyPageUrl, deploymentOrigin } from './src/seo.ts';
import {
  atTrpcIo,
  blog,
  type CopiedVersion,
  copiedVersions,
  llmsTxtPath,
  site,
} from './src/site.ts';
import { sponsorCardLede, sponsorPage } from './src/sponsors.ts';
import v9Sections from './v9/sections.json' with { type: 'json' };
import v10Sections from './v10/sections.json' with { type: 'json' };
import v11Sections from './v11/sections.json' with { type: 'json' };

const blogDir = new URL('blog', import.meta.url).pathname;
// Each version's docs, served at `/docs` (v11, the stable release),
// `/docs/v10` and `/docs/v9`.
const copiedSections = { v9: v9Sections, v10: v10Sections, v11: v11Sections };
const copies = copiedVersions.map((version) => ({
  dir: new URL(`${version.id}/docs`, import.meta.url).pathname,
  sections: copiedSections[version.id],
  version,
}));
const faviconFile = new URL('public/favicon.svg', import.meta.url).pathname;
const [copiedPages, posts, favicon, mediaPngs] = await Effect.runPromise(
  Effect.all([
    Effect.forEach(copies, (copy) =>
      Effect.map(
        docPages({
          basePath: copy.version.basePath,
          contentDir: copy.dir,
          firstDoc: copy.version.firstDoc,
          samplesDir,
          twoslash: copy.version.id === 'v11',
        }),
        (found) => ({ pages: found, version: copy.version }),
      ),
    ),
    blogPosts(blogDir),
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      return yield* fs.readFileString(faviconFile);
    }),
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const entries = yield* Effect.forEach(mediaAssets, (asset) =>
        Effect.map(
          fs.readFileString(
            new URL(`public${asset.src}`, import.meta.url).pathname,
          ),
          (svg) => [asset.png, { svg, width: asset.pngWidth }] as const,
        ),
      );
      return Object.fromEntries(entries);
    }),
  ]).pipe(Effect.provide(NodeServices.layer)),
);
/** Each version's `llms.txt` lists the others', as trpc.io's do. */
const llmsVersions = copiedVersions.map((version) => ({
  id: version.id,
  name: version.status === 'stable' ? `${version.id} (stable)` : version.id,
}));
const llmsOthers = (id: CopiedVersion['id']) =>
  llmsVersions
    .filter((version) => version.id !== id)
    .map((version) => ({ name: version.name, path: llmsTxtPath(version.id) }));
// Off trpc.io (a local build pointed elsewhere), canonical links point
// there, out of this sitemap.
const copySitemap = atTrpcIo
  ? { changefreq: 'weekly' as const, priority: 0.5 }
  : { exclude: true };

const docCard = (
  page: {
    readonly description: string;
    readonly path: string;
    readonly title: string;
  },
  url: string,
): DocCard => ({
  description: page.description,
  kind: 'doc',
  path: page.path,
  title: page.title,
  url,
});

const sentry = sentrySettings(process.env);

export default defineConfig({
  // `src/og/render.ts` inlines resvg's wasm.
  assetsInclude: ['**/*.wasm'],
  define: {
    // The environment the Experiments menu names (`src/flags.ts`).
    'import.meta.env.VERCEL_ENV': JSON.stringify(
      process.env['VERCEL_ENV'] ?? '',
    ),
    // Pages are prerendered, so their social cards' host is the build's.
    'import.meta.env.DEPLOYMENT_ORIGIN': JSON.stringify(
      deploymentOrigin(process.env),
    ),
    ...sentryDefines(sentry),
  },
  // The prerender fetches each page from this server in the build's own
  // process. `localhost` binds `::1` only, and a render that holds the event
  // loop past Node's 250ms per-address connect timer turns the fetch into
  // `ETIMEDOUT ::1`, then `ECONNREFUSED 127.0.0.1`; an IP has one address.
  preview: { host: '127.0.0.1' },
  plugins: [
    siteFiles(),
    ...copies.map((copy) =>
      docsContent({
        agentFiles: {
          llmsTxt: llmsTxtPath(copy.version.id),
          markdown: copy.version.id === 'v11',
          name: `tRPC ${copy.version.id}`,
          omitSections: [referenceSection],
          others: llmsOthers(copy.version.id),
        },
        basePath: copy.version.basePath,
        contentDir: copy.dir,
        firstDoc: copy.version.firstDoc,
        // trpc.io compiled v11's blocks with Twoslash, and so does the site;
        // the older versions' show as the plain code trpc.io showed.
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
        twoslash: copy.version.id === 'v11',
        twoslashCache: copy.version.id === 'v11' ? twoslashCache : undefined,
      }),
    ),
    blogContent({
      contentDir: blogDir,
      inlineApp: 'v11',
      manifestId: 'virtual:blog-manifest',
      samplesDir,
      sourceUrl: `${site.github}/blob/main/www`,
    }),
    blogFeeds({ posts }),
    siteIcons({ pngs: mediaPngs, svg: favicon }),
    ogCards([
      { kind: 'home', path: '/' },
      ...copiedPages.flatMap((copy) =>
        copy.pages.map((page) =>
          docCard(page, copyPageUrl(copy.version, page.slug)),
        ),
      ),
      docCard(
        {
          description: blog.description,
          path: '/blog',
          title: `The ${site.name} blog`,
        },
        absoluteUrl('/blog'),
      ),
      docCard(
        {
          description: sponsorCardLede,
          path: sponsorPage.path,
          title: sponsorPage.headline,
        },
        absoluteUrl(sponsorPage.path),
      ),
      ...[mediaPage, searchPage].map((page) =>
        docCard(page, absoluteUrl(page.path)),
      ),
      ...posts.map((post) => ({
        authors: post.authors,
        date: post.date,
        description: post.description,
        kind: 'post' as const,
        path: `/blog/${post.slug}`,
        readingMinutes: post.readingMinutes,
        title: post.title,
      })),
    ]),
    tailwindcss(),
    bundledServer(),
    tanstackStart({
      pages: [
        { path: '/', sitemap: { changefreq: 'weekly', priority: 1 } },
        ...copiedPages.flatMap((copy) =>
          copy.pages.map((page) => ({
            path: page.path,
            sitemap: copySitemap,
          })),
        ),
        {
          path: '/blog',
          sitemap: { changefreq: 'monthly', priority: 0.5 },
        },
        {
          path: sponsorPage.path,
          sitemap: { changefreq: 'monthly', priority: 0.5 },
        },
        ...[mediaPage, searchPage].map((page) => ({
          path: page.path,
          sitemap: { changefreq: 'yearly' as const, priority: 0.3 },
        })),
        ...posts.map((post) => ({
          path: `/blog/${post.slug}`,
          sitemap: copySitemap,
        })),
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
            // An index route (`/blog/`) is found with its slash, which the
            // host redirects away.
            (page.path === '/' || !page.path.endsWith('/')) &&
            // A query (`?flags=`) is rendered on request
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
    // Last, as Sentry's docs say.
    ...sentryUploadPlugins(
      process.env,
      sentry,
      new URL('dist', import.meta.url).pathname,
    ),
  ],
  resolve: { tsconfigPaths: true },
});
