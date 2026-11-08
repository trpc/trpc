// @ts-check

import { NextConfig } from 'next';
// Validates the environment variables at build time
import './src/server/env';

/**
 * @see https://nextjs.org/docs/api-reference/next.config.js/introduction
 */
export default {
  /** We run typechecking as a separate task in CI */
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ['@shared/ui'],
} satisfies NextConfig;
