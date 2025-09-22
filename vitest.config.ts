/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const aliases: Record<string, string> = {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(__dirname, 'packages');

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
  clearScreen: true,
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [__dirname + '/packages/tests/suppressActWarnings.ts'],
    snapshotFormat: {
      printBasicPrototype: true,
    },
    coverage: {
      provider: 'istanbul',
      include: ['**/src/**'],
      exclude: [
        '**/www/**',
        '**/examples/**',
        // skip codecov for experimental features
        // FIXME: delete me once they're stable
        '**/next/src/app-dir/**',
        '**/server/src/adapters/next-app-dir/**',
        // Skip codecov for codemod package
        '**/upgrade/src/**',
      ],
    },
    poolOptions: {
      threads: {
        useAtomics: !!process.env['CI'],
      },
      forks: {
        execArgv: ['--expose-gc'],
      },
    },
    retry: process.env['CI'] ? 2 : 0,
  },
  resolve: {
    alias: aliases,
  },
});
