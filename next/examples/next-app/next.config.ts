import type { NextConfig } from 'next';

const config: NextConfig = {
  // `'use cache'` and `cacheTag`, which the guestbook's data-cache tags need.
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    '@shared/ui',
    '@trpc12/trpc',
    '@trpc12/tanstack-query',
    '@trpc12/tanstack-react-query',
  ],
  // `pnpm typecheck` runs tsc (TypeScript 7), which Next's checker can't load.
  typescript: { ignoreBuildErrors: true },
};
export default config;
