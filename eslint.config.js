import * as path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import reactPlugin from 'eslint-plugin-react';
import * as reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  includeIgnoreFile(path.join(import.meta.dirname, '.gitignore')),
  reactHooks.configs.recommended,
  { ignores: ['**/vendor/**', 'packages/**', 'www/**', 'scripts/**'] },
  {
    files: ['examples/**/*.ts', 'examples/**/*.tsx'],
    plugins: {
      unicorn,
      react: reactPlugin,
    },
    extends: [
      ...tseslint.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    rules: {
      ...reactPlugin.configs['jsx-runtime'].rules,

      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/prefer-function-type': 'off',
      '@typescript-eslint/prefer-promise-reject-errors': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/consistent-type-exports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',

      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unicorn/filename-case': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',

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
