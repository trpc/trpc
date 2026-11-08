import { NextConfig } from 'next';

/**
 * @see https://nextjs.org/docs/api-reference/next.config.js/introduction
 */
export default {
  // Bundling `ws` breaks its optional native helpers
  serverExternalPackages: ['ws'],
  transpilePackages: ['@shared/ui'],
} satisfies NextConfig;
