import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite-plus';

// Solid and Svelte ship server builds under Node's conditions; their tests
// need the browser builds, resolved (and so inlined) by Vite. The SSR tests
// keep Node's conditions.
const browserBuild = (name: string, deps: string[]) => ({
  extends: true as const,
  resolve: { conditions: ['browser', 'development'] },
  test: {
    name,
    include: [`test/tanstack-query/${name}.test.ts`],
    server: { deps: { inline: deps } },
  },
});

export default defineConfig({
  fmt: {
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 80,
    ignorePatterns: [
      'pnpm-lock.yaml',
      '.repos/**',
      '**/dist/**',
      'spikes/**/generated/**',
      'test/**/generated/**',
    ],
  },
  lint: {
    ignorePatterns: [
      '.repos/**',
      '**/dist/**',
      'spikes/**/generated/**',
      'test/**/generated/**',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: ['./tooling/oxlint-plugin/index.ts'],
    rules: {
      'trpc/acronym-case': 'error',
    },
    overrides: [
      {
        files: ['packages/*/src/**'],
        excludeFiles: ['**/*.test.ts', '**/*.test.tsx', '**/*.test-d.ts'],
        rules: {
          'trpc/jsdoc': 'error',
        },
      },
      {
        files: ['spikes/**'],
        rules: {
          'no-console': 'off',
        },
      },
    ],
  },
  test: {
    environmentOptions: {
      // Framework tests render in happy-dom and call a test server on
      // another origin.
      happyDOM: { settings: { fetch: { disableSameOriginPolicy: true } } },
    },
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/*.test-d.ts'],
      reporter: ['text-summary', 'json-summary', 'text'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: [
            'packages/*/src/**/*.test.ts',
            'test/**/*.test.ts',
            'test/**/*.test.tsx',
            'spikes/**/*.test.ts',
            'tooling/**/*.test.ts',
          ],
          exclude: [
            '**/node_modules/**',
            'test/bun/**',
            'test/tanstack-query/solid.test.ts',
            'test/tanstack-query/svelte.test.ts',
            'test/tanstack-query/svelte-ssr.test.ts',
          ],
          typecheck: {
            enabled: true,
            tsconfig: './tsconfig.vitest.json',
            include: ['packages/*/src/**/*.test-d.ts', 'spikes/**/*.test-d.ts'],
          },
        },
      },
      browserBuild('solid', ['solid-js', '@tanstack/solid-query']),
      {
        ...browserBuild('svelte', [
          'svelte',
          '@tanstack/svelte-query',
          '@trpc12/tanstack-query',
          '@trpc12/tanstack-svelte-query',
        ]),
        plugins: [svelte({ configFile: false })],
      },
      {
        extends: true,
        plugins: [svelte({ configFile: false })],
        test: {
          name: 'svelte-ssr',
          include: ['test/tanstack-query/svelte-ssr.test.ts'],
          server: {
            deps: {
              inline: [
                'svelte',
                '@tanstack/svelte-query',
                '@trpc12/tanstack-query',
                '@trpc12/tanstack-svelte-query',
              ],
            },
          },
        },
      },
    ],
  },
  staged: {
    '*': 'vp check --fix',
    '*.ts': 'vp test related --run',
  },
});
