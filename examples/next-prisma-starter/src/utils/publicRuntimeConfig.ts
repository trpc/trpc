/**
 * Note: requires `ssr: true` or a `getInitialProps` in `_app.tsx`
 * @link https://nextjs.org/docs/api-reference/next.config.js/runtime-configuration
 */
import type * as config from '../../next.config';
import getConfig from 'next/config';

/**
 * Infers the type from the `publicRuntime` in `next.config.js`
 */
type PublicRuntimeConfig = typeof config.publicRuntimeConfig;

const nextConfig = getConfig();

export const publicRuntimeConfig =
  nextConfig.publicRuntimeConfig as PublicRuntimeConfig;
