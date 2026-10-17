import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite-plus';

// Solid and Svelte ship server builds under Node's conditions; their tests
// need the browser builds, resolved (and so inlined) by Vite. The SSR tests
// keep Node's conditions.
const browserBuild = (name: string, include: string, deps: string[]) => ({
  extends: true as const,
  resolve: { conditions: ['browser', 'development'] },
  test: {
    name,
    include: [include],
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
      'packages/*/src/**/fixtures/generated/**',
    ],
  },
  lint: {
    ignorePatterns: [
      '.repos/**',
      '**/dist/**',
      'spikes/**/generated/**',
      'packages/*/src/**/fixtures/generated/**',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: ['./tooling/oxlint-plugin/index.ts'],
    rules: {
      'trpc/acronym-case': 'error',
      'trpc/typed-objects': 'error',
    },
    overrides: [
      {
        files: ['packages/*/src/**'],
        excludeFiles: [
          '**/*.test.ts',
          '**/*.test.tsx',
          '**/*.test-d.ts',
          '**/fixtures/**',
        ],
        rules: {
          'trpc/jsdoc': 'error',
        },
      },
      {
        files: ['spikes/**'],
        rules: {
          'no-console': 'off',
          'trpc/typed-objects': 'off',
        },
      },
    ],
  },
  test: {
    unstubGlobals: true,
    restoreMocks: true,
    environmentOptions: {
      // Framework tests render in happy-dom and call a test server on
      // another origin.
      happyDOM: { settings: { fetch: { disableSameOriginPolicy: true } } },
    },
    coverage: {
      provider: 'v8',
      reportOnFailure: true,
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.test-d.ts',
        '**/fixtures/**',
      ],
      reporter: ['text-summary', 'json-summary', 'text'],
      thresholds: { statements: 98, branches: 98, functions: 98, lines: 98 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: [
            'packages/*/src/**/*.test.ts',
            'packages/*/src/**/*.test.tsx',
            'test/**/*.test.ts',
            'test/**/*.test.tsx',
            'spikes/**/*.test.ts',
            'tooling/**/*.test.ts',
          ],
          exclude: [
            '**/node_modules/**',
            '**/*.bun.test.ts',
            'packages/tanstack-solid-query/src/index.test.ts',
            'packages/tanstack-svelte-query/src/index.test.ts',
            'packages/tanstack-svelte-query/src/ssr.test.ts',
          ],
          typecheck: {
            enabled: true,
            tsconfig: './tsconfig.vitest.json',
            include: ['packages/*/src/**/*.test-d.ts', 'spikes/**/*.test-d.ts'],
          },
        },
      },
      browserBuild('solid', 'packages/tanstack-solid-query/src/index.test.ts', [
        'solid-js',
        '@tanstack/solid-query',
      ]),
      {
        ...browserBuild(
          'svelte',
          'packages/tanstack-svelte-query/src/index.test.ts',
          [
            'svelte',
            '@tanstack/svelte-query',
            '@trpc12/tanstack-query',
            '@trpc12/tanstack-svelte-query',
          ],
        ),
        plugins: [svelte({ configFile: false })],
      },
      {
        extends: true,
        plugins: [svelte({ configFile: false })],
        test: {
          name: 'svelte-ssr',
          include: ['packages/tanstack-svelte-query/src/ssr.test.ts'],
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
