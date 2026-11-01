import { NextConfig } from 'next';
import { vercelHost } from './src/utils/vercelHost';

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
  // Bundling `ws` breaks its optional native helpers
  serverExternalPackages: ['ws'],
  /** Next.js only knows ESLint; we lint with oxlint as a separate task */
  eslint: { ignoreDuringBuilds: true },
} satisfies NextConfig;
