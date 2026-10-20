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
      // TanStack Router writes these.
      '**/src/routeTree.gen.ts',
      // `pnpm --filter @samples/docs generate:api` writes these.
      'www/samples/docs/openapi.json',
      'www/samples/docs/src/api/**',
      // `pnpm --filter @trpc12/www old-docs:copy` writes these.
      'www/v11/**',
      'www/v10/**',
      'www/v9/**',
      'www/blog/**',
      'www/old-docs.json',
      'www/sponsors.json',
    ],
  },
  lint: {
    ignorePatterns: [
      // shadcn's CLI writes these; reinstall them, don't edit them.
      'shared/ui/src/**',
      '.repos/**',
      '**/dist/**',
      'spikes/**/generated/**',
      'packages/*/src/**/fixtures/generated/**',
      // TanStack Router writes these.
      '**/src/routeTree.gen.ts',
      // `pnpm --filter @samples/docs generate:api` writes these.
      'www/samples/docs/openapi.json',
      'www/samples/docs/src/api/**',
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    plugins: ['typescript', 'unicorn', 'oxc', 'vitest', 'import'],
    jsPlugins: [
      './tooling/oxlint-plugin/index.ts',
      './tooling/oxlint-plugin/anti-slop/effect/index.ts',
    ],
    // Warnings don't fail `pnpm check`, so a stray `test.only` would pass.
    categories: { correctness: 'error' },
    rules: {
      // Runtime import cycles only: `import type` edges are erased and ignored.
      'import/no-cycle': 'error',
      // From Effect's oxlint config. A value import used only as a type keeps
      // a runtime edge, which `import/no-cycle` counts.
      'typescript/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports' },
      ],
      'typescript/no-import-type-side-effects': 'error',
      'typescript/no-unnecessary-type-constraint': 'error',
      'typescript/no-useless-empty-export': 'error',
      'import/no-duplicates': 'error',
      'import/no-self-import': 'error',
      'no-unneeded-ternary': 'error',
      'no-useless-concat': 'error',
      'no-useless-constructor': 'error',
      'no-var': 'error',
      'unicorn/no-accessor-recursion': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      // From raf-query's.
      'no-empty': 'error',
      // A `let` read by a closure that can run before it's assigned stays.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      // Rethrowing from a `catch` keeps the caught error as `cause`.
      'preserve-caught-error': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            // `vitest/no-hooks` without the loophole; clean up with `using`.
            ...['vite-plus/test', '@effect/vitest'].map((name) => ({
              name,
              importNames: ['onTestFinished'],
              message: 'Return a Disposable and `using` it instead.',
            })),
            // No workspace package depends on `vitest`: a local checkout
            // resolves it through a hoisted copy, and CI fails to.
            {
              name: 'vitest',
              message:
                "Import from 'vite-plus/test', or '@effect/vitest' in a package that depends on it.",
            },
          ],
        },
      ],
      // From oRPC's. A `for…in` also walks keys inherited from a polluted
      // `Object.prototype`.
      'guard-for-in': 'error',
      'trpc/acronym-case': 'error',
      'trpc/no-custom-test-timeout': 'error',
      'trpc/no-mock': 'error',
      'trpc/no-overzealous-destructuring': 'error',
      'trpc/typed-objects': 'error',
      'typescript/ban-ts-comment': [
        'error',
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
      'typescript/no-deprecated': 'error',
      // Clean up with `using`: a helper returns a Disposable that undoes its
      // setup, and the test's scope disposes it.
      'vitest/no-hooks': 'error',
      // Type tests assert with `@ts-expect-error`, not `expect`.
      'vitest/expect-expect': 'off',
      // Tests narrow a union (`if (r.ok)`) before asserting on its members.
      'vitest/no-conditional-expect': 'off',
      // Shared assertion helpers call `expect` outside a test block.
      'vitest/no-standalone-expect': 'off',
    },
    overrides: [
      {
        // Code built on Effect. Opt-in, because these rules push Effect idioms
        // into code that doesn't use it.
        files: [
          'packages/*/src/**',
          'tooling/**',
          'test/**',
          'examples/effect/**',
          'examples/effect-observability/**',
          'examples/saas-api/**',
          'examples/media-pipeline/**',
        ],
        rules: {
          'anti-slop-effect/no-manual-effect-error-tag': 'error',
          'anti-slop-effect/no-manual-tag-comparison': 'error',
          'anti-slop-effect/no-manual-tagged-construction': 'error',
          'anti-slop-effect/prefer-effect-match': 'error',
          'trpc/no-throw-in-effect': 'error',
        },
      },
      {
        files: ['examples/**'],
        rules: {
          'trpc/infer-callback-params': 'error',
        },
      },
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
        // A folder under a root is a module: other code imports its index.ts.
        files: ['packages/trpc/src/**'],
        rules: {
          'trpc/module-boundaries': [
            'error',
            {
              roots: [
                'packages/trpc/src/server',
                'packages/trpc/src/serializer',
                'packages/trpc/src/interop',
                'packages/trpc/src/client',
                'packages/trpc/src/openapi',
              ],
              ignore: ['fixtures'],
            },
          ],
        },
      },
      {
        // A docs page shows a sample one `#region` at a time, so a region
        // imports what it shows even when another region already did.
        files: ['www/samples/**'],
        rules: {
          'import/no-duplicates': 'off',
        },
      },
      {
        // The kitchen sink runs the demo code the reader edits, in the page.
        files: ['www/src/kitchen-sink/modules.ts'],
        rules: {
          'typescript/no-implied-eval': 'off',
        },
      },
      {
        files: ['spikes/**'],
        rules: {
          'no-console': 'off',
          'trpc/no-overzealous-destructuring': 'off',
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
    // `pnpm coverage` runs the `packages*` projects alone: coverage only
    // counts `packages/*/src`, and the other projects add nothing to it.
    projects: [
      {
        extends: true,
        test: {
          name: 'packages',
          include: [
            'packages/*/src/**/*.test.ts',
            'packages/*/src/**/*.test.tsx',
            'test/**/*.test.ts',
            'test/**/*.test.tsx',
          ],
          exclude: [
            '**/node_modules/**',
            '**/*.bun.test.ts',
            'packages/experimental-tanstack-solid-query/src/index.test.ts',
            'packages/experimental-tanstack-svelte-query/src/index.test.ts',
            'packages/experimental-tanstack-svelte-query/src/ssr.test.ts',
          ],
          typecheck: {
            enabled: true,
            tsconfig: './tsconfig.vitest.json',
            include: ['packages/*/src/**/*.test-d.ts'],
          },
        },
      },
      {
        extends: true,
        test: {
          name: 'repo',
          include: [
            'spikes/**/*.test.ts',
            'tooling/**/*.test.ts',
            'www/build/**/*.test.ts',
            'www/src/**/*.test.ts',
            'examples/*/*.test.ts',
            'examples/*/src/**/*.test.ts',
          ],
          exclude: ['**/node_modules/**'],
          typecheck: {
            enabled: true,
            tsconfig: './tsconfig.vitest.json',
            include: ['spikes/**/*.test-d.ts'],
          },
        },
      },
      // A UI example tests with its own plugins and environment.
      'examples/experimental/framework-matrix/vite.config.ts',
      browserBuild(
        'packages-solid',
        'packages/experimental-tanstack-solid-query/src/index.test.ts',
        ['solid-js', '@tanstack/solid-query'],
      ),
      {
        ...browserBuild(
          'packages-svelte',
          'packages/experimental-tanstack-svelte-query/src/index.test.ts',
          [
            'svelte',
            '@tanstack/svelte-query',
            '@trpc12/tanstack-query',
            '@trpc12/experimental-tanstack-svelte-query',
          ],
        ),
        plugins: [svelte({ configFile: false })],
      },
      {
        extends: true,
        plugins: [svelte({ configFile: false })],
        test: {
          name: 'packages-svelte-ssr',
          include: [
            'packages/experimental-tanstack-svelte-query/src/ssr.test.ts',
          ],
          server: {
            deps: {
              inline: [
                'svelte',
                '@tanstack/svelte-query',
                '@trpc12/tanstack-query',
                '@trpc12/experimental-tanstack-svelte-query',
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
    'www/docs/**/*.md': 'node tooling/docs-lint/docs-lint.ts',
  },
});
