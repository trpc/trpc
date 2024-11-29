import * as path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  includeIgnoreFile(path.join(import.meta.dirname, '.gitignore')),
  { ignores: ['**/vendor/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      unicorn,
      react: reactPlugin,
      'react-hooks': hooksPlugin,
      // 'react-compiler': compilerPlugin,
    },
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...hooksPlugin.configs.recommended.rules,

      // These rules aren't enabled in typescript-eslint's basic recommended config, but we like them
      '@typescript-eslint/no-non-null-assertion': 'error',

      // These rules enabled in typescript-eslint's configs don't apply here
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/prefer-function-type': 'off',

      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/consistent-type-exports': 'off',

      // Todo: do we want these?
      '@typescript-eslint/no-explicit-any': 'off',

      'unicorn/filename-case': [
        'error',
        {
          case: 'camelCase',
          ignore: [
            'TRPC',
            'RPC',
            'HTTP',
            'JSON',
            '\\.config\\.js',
            '\\.d\\.ts$',
            'issue-\\d+-.*\\.test\\.tsx?$',
            '\\.(t|j)sx$',
            '@trpc/*',
            'unstable-*',
            'script',
            'URL',
            'next-app-dir',
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'typeParameter',
          format: ['PascalCase'],
          leadingUnderscore: 'allow',
          custom: {
            regex: '^(T|\\$)([A-Z]([a-zA-Z]+))?[0-9]*$',
            match: true,
          },
        },
      ],
      'max-params': ['error', 3],
      '@typescript-eslint/consistent-type-imports': 'error',
      // '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@trpc/*/src'],
              message: 'Remove the "`/src`" part of this import',
              allowTypeImports: false,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[object.name="Symbol"][property.name="asyncDispose"]',
          message:
            'Usage of Symbol.asyncDispose is not allowed - use `makeAsyncResource()`',
        },
        {
          selector:
            'MemberExpression[object.name="Symbol"][property.name="dispose"]',
          message:
            'Usage of Symbol.dispose is not allowed - use `makeResource()`',
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['examples/**/*', 'packages/*/**/*', 'scripts/**/*', 'www/**/*'],
    rules: {
      // Todo: enable these for even stronger linting! 💪
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-declaration-merging': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    files: ['examples/**/*'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unicorn/filename-case': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },
  {
    files: [
      '**/test/**/*',
      'packages/tests/**/*',
      '**/*.test.tsx',
      '**/*.test.ts',
    ],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/switch-exhaustiveness-check': 'off',
    },
  },
  {
    files: ['packages/**/*'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: ['packages/server/src/adapters/**/*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@trpc/server'],
            },
            {
              group: ['unstable-core-do-not-import'],
              message:
                'Use e.g. `../@trpc/server/http` instead - avoiding importing core helps us ensure third party adapters can be made',
            },
          ],
        },
      ],
    },
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    languageOptions: {
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
