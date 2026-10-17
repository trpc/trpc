import { NodeServices } from '@effect/platform-node';
import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { Effect } from 'effect';
import { defineConfig } from 'vite-plus';

import { docPages, docsContent } from './build/content.ts';
import { sections, site } from './src/site.ts';

const contentDir = new URL('../docs', import.meta.url).pathname;
const samplesDir = new URL('samples', import.meta.url).pathname;
// CI caches this dir, keyed like the dependencies.
const twoslashCacheDir = new URL(
  'node_modules/.cache/twoslash',
  import.meta.url,
).pathname;
const lockfile = new URL('../pnpm-lock.yaml', import.meta.url).pathname;
const pages = await Effect.runPromise(
  docPages({ contentDir, samplesDir }).pipe(Effect.provide(NodeServices.layer)),
);

export default defineConfig({
  plugins: [
    docsContent({
      contentDir,
      samplesDir,
      sections,
      siteUrl: site.url,
      sourceUrl: site.sourceUrl,
      summary: site.description,
      twoslashCache: { dir: twoslashCacheDir, inputs: [lockfile] },
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
        filter: (page) => page.path !== '/docs' && !/[?#]/.test(page.path),
      },
      sitemap: { enabled: true, host: site.url },
    }),
    react(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
});
