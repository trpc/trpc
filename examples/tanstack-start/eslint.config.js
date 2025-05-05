import eslint from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import * as reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      react: reactPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      'react-hooks/react-compiler': 'error',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
    languageOptions: {
      globals: {
        React: 'writable',
      },
    },
  },
);
