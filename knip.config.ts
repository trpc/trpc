import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: ['scripts/*.ts'],
      ignoreDependencies: [
        // Used by prettier config
        '@ianvs/prettier-plugin-sort-imports',
        'prettier-plugin-tailwindcss',
        // Used by ESLint config
        '@eslint/compat',
        'eslint-plugin-react',
        'eslint-plugin-react-hooks',
        'eslint-plugin-unicorn',
        'typescript-eslint',
        // CI / publish tooling
        '@actions/core',
        '@actions/github',
        'lerna',
        '@manypkg/cli',
        // Testing infrastructure
        '@testing-library/dom',
        '@testing-library/jest-dom',
        '@testing-library/react',
        '@testing-library/user-event',
        '@vitest/coverage-istanbul',
        '@vitest/ui',
        // Used across examples
        'express',
        'event-source-polyfill',
        '@types/event-source-polyfill',
      ],
    },
    'packages/*': {
      entry: ['src/index.ts'],
      ignore: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**'],
    },
  },
  ignore: ['examples/**', 'www/**'],
  exclude: ['unlisted'],
};

export default config;
