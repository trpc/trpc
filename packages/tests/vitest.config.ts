import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vitest/config';

const aliases: Record<string, string> = {};

for (const pkg of [
  //'core',
  'server',
  'client',
  'react-query',
  'next',
].sort()) {
  const pkgJson = path.join(__dirname, `/../${pkg}/package.json`);

  const json = JSON.parse(fs.readFileSync(pkgJson, 'utf-8').toString());
  const exports = json.exports;
  for (const key of Object.keys(exports).sort()) {
    if (key.includes('.json')) {
      continue;
    }
    // trim first './'
    const trimmed = key.slice(1);
    aliases[`@trpc/${pkg}${trimmed}`] = path
      .join(__dirname, `../${pkg}/src${key.slice(1)}`)
      .replace(/\\/g, '/');
  }
}

export default defineConfig({
  root: '../',
  clearScreen: false,
  test: {
    environment: 'jsdom',
    globals: true,
    snapshotFormat: {
      printBasicPrototype: true,
    },
    setupFiles: ['./tests/setupTests.ts'],
    coverage: {
      provider: 'istanbul',
      include: ['*/src/**/*.{ts,tsx,js,jsx}'],
      exclude: ['**/deprecated/**'],
    },
    useAtomics: !!process.env['CI'],
  },
  resolve: {
    alias: {
      ...aliases,
      'vitest-environment-miniflare': [
        __dirname,
        'node_modules/vitest-environment-miniflare',
      ].join('/'),
      '@vitest/coverage-istanbul': [
        __dirname,
        'node_modules/@vitest/coverage-istanbul',
      ].join('/'),
    },
  },
});
