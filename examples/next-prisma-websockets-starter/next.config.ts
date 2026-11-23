import { NextConfig } from 'next';

/**
 * @see https://nextjs.org/docs/app/api-reference/config/next-config-js
 */
export default {
  // Bundling `ws` breaks its optional native helpers
  serverExternalPackages: ['ws'],
  transpilePackages: ['@shared/ui'],
  /** Next.js only knows ESLint; we lint with oxlint as a separate task */
  eslint: { ignoreDuringBuilds: true },
} satisfies NextConfig;
