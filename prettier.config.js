/** @typedef  {import("@ianvs/prettier-plugin-sort-imports").PluginConfig} SortImportsConfig*/
/** @typedef  {import("prettier").Config} PrettierConfig*/
/** @typedef  {{ tailwindConfig: string }} TailwindConfig*/

/** @type { PrettierConfig | SortImportsConfig | TailwindConfig } */
export default {
  printWidth: 80,
  trailingComma: 'all',
  endOfLine: 'auto',
  singleQuote: true,
  importOrder: [
    // Ensure test helpers are sorted first so that polyfills are loaded
    '___',
    '__',
    '^@trpc/server/__tests__(.*)$',
    '^@trpc/client/__tests__(.*)$',
    '^@trpc/react-query/__tests__(.*)$',
    '^@trpc/tanstack-query/__tests__(.*)$',
    '^@trpc/next/__tests__(.*)$',
    '<THIRD_PARTY_MODULES>',
    '^[./]',
  ],
  importOrderParserPlugins: ['typescript', 'jsx', 'explicitResourceManagement'],
  tailwindConfig: './www/tailwind.config.ts',
  plugins: [
    '@ianvs/prettier-plugin-sort-imports',
    /**
     * Tailwind plugin must come last!
     */
    'prettier-plugin-tailwindcss',
  ],
};
