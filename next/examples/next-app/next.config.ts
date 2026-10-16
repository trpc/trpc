import type { NextConfig } from 'next';

const config: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: [
    'trpcdev',
    '@trpcdev/tanstack-query',
    '@trpcdev/tanstack-react-query',
  ],
  // `pnpm typecheck` runs tsc (TypeScript 7), which Next's checker can't load.
  typescript: { ignoreBuildErrors: true },
};
export default config;
