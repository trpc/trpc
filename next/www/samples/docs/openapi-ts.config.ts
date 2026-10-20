/**
 * Hey API's config for `./openapi.json`. `pnpm generate:api` runs Hey API
 * with TypeScript 6: it needs TypeScript's JS API, which TypeScript 7
 * doesn't have. Only types are imported, so the config loads there too.
 */
import type { UserConfig } from '@hey-api/openapi-ts';

export default {
  input: './openapi.json',
  output: 'src/api',
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    { name: '@hey-api/sdk', transformer: true },
    { name: '@hey-api/transformers', dates: true },
  ],
} satisfies UserConfig;
