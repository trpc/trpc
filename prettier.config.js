/** @typedef  {import("@ianvs/prettier-plugin-sort-imports").PluginConfig} SortImportsConfig*/
/** @typedef  {import("prettier").Config} PrettierConfig*/
/** @typedef  {{ tailwindConfig: string }} TailwindConfig*/

/** @type { PrettierConfig | SortImportsConfig | TailwindConfig } */
export default {
  printWidth: 80,
  trailingComma: 'all',
  endOfLine: 'auto',
  singleQuote: true,
  importOrder: ['___', '__', '<THIRD_PARTY_MODULES>', '^[./]'],
  tailwindConfig: './www/tailwind.config.ts',
  plugins: [
    '@ianvs/prettier-plugin-sort-imports',
    /**
     * Tailwind plugin must come last!
     */
    'prettier-plugin-tailwindcss',
  ],
};
