import type { TwoslashCacheOptions } from './twoslash-cache.ts';

/** The sample apps the code blocks compile in. */
export const samplesDir = new URL('../samples', import.meta.url).pathname;

// Kept between builds: Vercel restores `node_modules` under the project's
// root, and CI caches the dir.
export const cacheDir = new URL('../node_modules/.cache', import.meta.url)
  .pathname;

export const twoslashCache: TwoslashCacheOptions = {
  dir: `${cacheDir}/twoslash`,
  lockfile: new URL('../../pnpm-lock.yaml', import.meta.url).pathname,
  tools: {
    dir: new URL('..', import.meta.url).pathname,
    packages: ['@shikijs/twoslash', 'twoslash', 'typescript6'],
  },
};
