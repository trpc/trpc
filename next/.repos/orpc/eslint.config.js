import antfu from '@antfu/eslint-config'
import pluginBan from 'eslint-plugin-ban'

export default antfu({
  formatters: true,
  ignores: [
    'packages/cloudflare/worker-configuration.d.ts',
    'playgrounds/cloudflare/worker-configuration.d.ts',
  ],
  rules: {
    'pnpm/yaml-enforce-settings': 'off',
    'yaml/sort-keys': 'off',
    'jsdoc/no-defaults': 'off',
    'guard-for-in': 'error',
  },
}, {
  plugins: { ban: pluginBan },
  rules: {
    'ts/consistent-type-definitions': 'off',
    'ts/method-signature-style': ['off'],
    'ban/ban': [
      'error',
      {
        name: ['JSON', 'stringify'],
        message: 'JSON.stringify can return undefined, use stringifyJSON instead',
      },
      {
        name: ['*', 'bytes'],
        message: 'Request/Blob/Response/... .bytes is not widely supported, use readAsBuffer instead',
      },
      {
        name: ['AbortSignal', 'any'],
        message: 'Use anyAbortSignal instead',
      },
      {
        name: ['*', 'throwIfAborted'],
        message: 'React Native\'s AbortSignal polyfill has no throwIfAborted, use throwIfAborted from @orpc/shared instead',
      },
    ],
    'no-restricted-imports': ['error', {
      patterns: [{
        group: [
          '/@openapi-spec/types',
          '/@standard-schema/spec',
          '/compression',
        ],
        message: 'Please import from @orpc/* instead',
      }],
    }],
    'pnpm/json-enforce-catalog': 'off',
  },
}, {
  files: ['packages/*/src/**'],
  rules: {
    // a scoped block replaces the base rule rather than extending it,
    // so the first two names repeat what @antfu/eslint-config already bans
    'no-restricted-globals': ['error', {
      name: 'global',
      message: 'Use `globalThis` instead.',
    }, {
      name: 'self',
      message: 'Use `globalThis` instead.',
    }, {
      name: 'AbortSignal',
      message: 'AbortSignal is not a global in every runtime, read it only behind a typeof guard',
    }, {
      name: 'encodeURIComponent',
      message: 'encodeURIComponent throws on lone surrogates, use safeEncodeURIComponent from @orpc/shared instead',
    }, {
      name: 'decodeURIComponent',
      message: 'decodeURIComponent throws on malformed input, use safeDecodeURIComponent from @orpc/shared instead',
    }],
  },
}, {
  files: ['**/*.test.ts', '**/*.test.tsx', '**/*.test-d.ts', '**/*.test-d.tsx', 'apps/content/shared/**', 'playgrounds/**', 'packages/*/playground/**'],
  rules: {
    'unused-imports/no-unused-vars': 'off',
    'antfu/no-top-level-await': 'off',
    'no-alert': 'off',
    'ban/ban': 'off',
    'no-restricted-globals': 'off',
  },
}, {
  files: [
    'apps/content/shared/**',
    'apps/content/blog/**',
    'apps/content/docs/**',
    'apps/content/examples/**',
    'playgrounds/**',
    'packages/*/playground/**',
    'skills/**',
  ],
  rules: {
    'no-restricted-imports': 'off',
    'no-console': 'off',
    'perfectionist/sort-imports': 'off',
    'import/first': 'off',
    'ban/ban': 'off',
    'no-var': 'off',
    'vars-on-top': 'off',
    'unicorn/prefer-type-error': 'off',
    'antfu/no-import-node-modules-by-path': 'off',
    'no-restricted-globals': 'off',
    'import/no-duplicates': 'off',
  },
}, {
  files: ['apps/content/examples/**'],
  rules: {
    'import/first': 'off',
  },
}, {
  files: ['playgrounds/**'],
  rules: {
    'no-alert': 'off',
    'eslint-comments/no-unlimited-disable': 'off',
    'node/prefer-global/process': 'off',
  },
}, {
  files: ['playgrounds/nest/**'],
  rules: {
    '@typescript-eslint/consistent-type-imports': 'off',
  },
})
