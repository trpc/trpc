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
import { OgCard, ogImages } from './build/og-image.ts';
import {
  sentryDefines,
  sentrySettings,
  sentryUploadPlugins,
} from './build/sentry.ts';
import { siteFiles } from './build/site-files.ts';
import { cacheDir, samplesDir, twoslashCache } from './build/paths.ts';
import { mediaPage, searchPage } from './src/pages.ts';
import { absoluteUrl, copyPageUrl, postDate, trpcPostUrl } from './src/seo.ts';
import {
  atTrpcIo,
  blog,
  type CopiedVersion,
  copiedVersions,
  llmsTxtPath,
  site,
} from './src/site.ts';
import { partners, sponsorCardLede, sponsorPage } from './src/sponsors.ts';
import v9Sections from './v9/sections.json' with { type: 'json' };
import v10Sections from './v10/sections.json' with { type: 'json' };
import v11Sections from './v11/sections.json' with { type: 'json' };

const blogDir = new URL('blog', import.meta.url).pathname;
// Each version's docs, served at `/docs` (v11, the stable release),
// `/v10/docs` and `/v9/docs`.
const copiedSections = { v9: v9Sections, v10: v10Sections, v11: v11Sections };
const copies = copiedVersions.map((version) => ({
  dir: new URL(`${version.id}/docs`, import.meta.url).pathname,
  sections: copiedSections[version.id],
  version,
}));
const faviconFile = new URL('public/favicon.svg', import.meta.url).pathname;
const [copiedPages, posts, favicon] = await Effect.runPromise(
  Effect.all([
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
  page: (typeof copiedPages)[number]['pages'][number],
  version: CopiedVersion['id'],
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

const sentry = sentrySettings(process.env);

export default defineConfig({
  define: {
    // The environment the Experiments menu names (`src/flags.ts`).
    'import.meta.env.VERCEL_ENV': JSON.stringify(
      process.env['VERCEL_ENV'] ?? '',
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
      inlineApp: 'v11',
      manifestId: 'virtual:blog-manifest',
      samplesDir,
      sourceUrl: `${site.github}/blob/main/www`,
    }),
    blogFeeds({ posts }),
    siteIcons({ svg: favicon }),
    ogImages({
      cacheDir: `${cacheDir}/og`,
      cards: [
        OgCard.Home({ path: '/' }),
        ...copiedPages.flatMap((copy) =>
          copy.pages.map((page) =>
            docCard(
              page,
              copy.version.id,
              copyPageUrl(
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
        OgCard.Sponsor({
          headline: sponsorPage.headline,
          lede: sponsorCardLede,
          partners,
          path: sponsorPage.path,
          url: absoluteUrl(sponsorPage.path),
        }),
        ...[mediaPage, searchPage].map((page) =>
          OgCard.Page({
            ...page,
            eyebrow: '',
            pill: 'MIT licensed',
            url: absoluteUrl(page.path),
          }),
        ),
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
        ...copiedPages.flatMap((copy) =>
          copy.pages.map((page) => ({ path: page.path, sitemap: copySitemap })),
        ),
        { path: '/blog', sitemap: { changefreq: 'monthly', priority: 0.5 } },
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
            copiedVersions.every((version) => page.path !== version.basePath) &&
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
