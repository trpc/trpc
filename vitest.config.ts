/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

const aliases: Record<string, string> = {};
const packagesDir = new URL('./packages', import.meta.url).pathname;

const dirs = readdirSync(packagesDir)
  .filter((it) => it !== 'tests' && !it.startsWith('.'))
  .filter((it) => existsSync(join(packagesDir, it, 'package.json')));

for (const pkg of dirs.sort()) {
  const pkgJson = join(packagesDir, pkg, 'package.json');

  const json = JSON.parse(readFileSync(pkgJson, 'utf-8').toString());
  const exports = json.exports;

  for (const key of Object.keys(exports).sort()) {
    if (key.includes('.json')) {
      continue;
    }
    // trim first './'
    const trimmed = key.slice(1);
    aliases[`@trpc/${pkg}${trimmed}`] = join(
      packagesDir,
      pkg,
      'src',
      key.slice(1),
    ).replace(/\\/g, '/');
  }
}

export default defineConfig({
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
      include: ['**/src/**'],
      exclude: ['**/www/**', '**/examples/**'],
    },
    poolOptions: {
      threads: {
        useAtomics: !!process.env['CI'],
      },
    },
  },
  resolve: {
    alias: aliases,
  },
});
