// @ts-check

import { NextConfig } from 'next';
// Validates the env vars when the app builds or starts
import './src/server/env';

/**
 * @see https://nextjs.org/docs/api-reference/next.config.js/introduction
 */
export default {
  /** Next.js only knows ESLint; we lint with oxlint as a separate task */
  eslint: {
    ignoreDuringBuilds: true,
  },
  /** We run typechecking as a separate task in CI */
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@shared/ui'],
} satisfies NextConfig;
