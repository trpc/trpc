import eslint from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': hooksPlugin,
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...hooksPlugin.configs.recommended.rules,
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
