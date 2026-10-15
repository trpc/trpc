import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite-plus';

// Solid and Svelte ship server builds under Node's conditions; their tests
// need the browser builds, resolved (and so inlined) by Vite.
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
    ],
  },
  lint: {
    ignorePatterns: ['.repos/**', '**/dist/**', 'spikes/**/generated/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: ['./tooling/oxlint-plugin/index.ts'],
    rules: {
      'trpcdev/acronym-case': 'error',
    },
    overrides: [
      {
        files: ['packages/*/src/**'],
        excludeFiles: ['**/*.test.ts', '**/*.test.tsx', '**/*.test-d.ts'],
        rules: {
          'trpcdev/jsdoc': 'error',
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
            'test/tanstack-query/solid.test.ts',
            'test/tanstack-query/svelte.test.ts',
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
          '@trpcdev/tanstack-query',
          '@trpcdev/tanstack-svelte-query',
        ]),
        plugins: [svelte({ configFile: false })],
      },
    ],
  },
  staged: {
    '*': 'vp check --fix',
    '*.ts': 'vp test related --run',
  },
});
