import { NextConfig } from 'next';

// On Vercel, use the deployment's own url rather than the local defaults in `.env`
const vercelHost =
  process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_BRANCH_URL;

/**
 * @see https://nextjs.org/docs/api-reference/next.config.js/introduction
 */
export default {
  serverRuntimeConfig: {
    // Will only be available on the server side
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    APP_URL: vercelHost ? `https://${vercelHost}` : process.env.APP_URL,
    WS_URL: vercelHost ? `wss://${vercelHost}/api/trpc-ws` : process.env.WS_URL,
  },
  /** We run eslint as a separate task in CI */
  eslint: { ignoreDuringBuilds: !!process.env.CI },
} satisfies NextConfig;
