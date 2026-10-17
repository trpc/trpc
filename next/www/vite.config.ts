import { NodeServices } from '@effect/platform-node';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { Effect } from 'effect';
import { defineConfig } from 'vite-plus';

import { docPages, docsContent } from './build/content.ts';
import { sections, site, v11 } from './src/site.ts';
import v11Sections from './v11/sections.json' with { type: 'json' };

const contentDir = new URL('../docs', import.meta.url).pathname;
const samplesDir = new URL('samples', import.meta.url).pathname;
// A copy of the v11 docs (`build/v11-copy.ts`), served at `/v11/docs`.
const v11Dir = new URL('v11/docs', import.meta.url).pathname;
// CI caches this dir, keyed like the dependencies.
const twoslashCacheDir = new URL(
  'node_modules/.cache/twoslash',
  import.meta.url,
).pathname;
const lockfile = new URL('../pnpm-lock.yaml', import.meta.url).pathname;
const [pages, v11Pages] = await Effect.runPromise(
  Effect.all([
    docPages({ basePath: '/docs', contentDir, samplesDir }),
    docPages({ basePath: v11.basePath, contentDir: v11Dir, samplesDir }),
  ]).pipe(Effect.provide(NodeServices.layer)),
);

export default defineConfig({
  plugins: [
    docsContent({
      agentFiles: true,
      basePath: '/docs',
      contentDir,
      manifestId: 'virtual:docs-manifest',
      samplesDir,
      sections,
      siteUrl: site.url,
      sourceUrl: site.sourceUrl,
      summary: site.description,
      twoslashCache: { dir: twoslashCacheDir, inputs: [lockfile] },
      v11Dir,
    }),
    docsContent({
      agentFiles: false,
      basePath: v11.basePath,
      contentDir: v11Dir,
      manifestId: 'virtual:v11-docs-manifest',
      samplesDir,
      sections: v11Sections,
      siteUrl: site.url,
      sourceUrl: `${site.github}/blob/main/www`,
      summary: site.description,
    }),
    tailwindcss(),
    tanstackStart({
      pages: [
        { path: '/', sitemap: { changefreq: 'weekly', priority: 1 } },
        ...pages.map((page) => ({
          path: page.path,
          sitemap: {
            changefreq: 'weekly' as const,
            lastmod: page.lastModified,
            priority: 0.8,
          },
        })),
        // trpc.io is where the v11 docs are found; each page's canonical
        // link points there.
        ...v11Pages.map((page) => ({
          path: page.path,
          sitemap: { exclude: true },
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
        filter: (page) =>
          page.path !== '/docs' &&
          page.path !== v11.basePath &&
          !/[?#]/.test(page.path),
      },
      sitemap: { enabled: true, host: site.url },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
