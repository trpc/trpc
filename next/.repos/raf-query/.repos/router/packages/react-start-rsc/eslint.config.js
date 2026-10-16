// @ts-check

import pluginReact from '@eslint-react/eslint-plugin'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import rootConfig from '../../eslint.config.js'

export default [
  ...rootConfig,
  {
    ...pluginReact.configs.recommended,
    files: ['**/*.{ts,tsx}'],
  },
  {
    plugins: {
      'react-hooks': pluginReactHooks,
    },
    rules: {
      '@eslint-react/no-unstable-context-value': 'off',
      '@eslint-react/no-unstable-default-props': 'off',
      '@eslint-react/dom/no-missing-button-type': 'off',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error',
    },
  },
  {
    name: 'react-start-rsc/import-boundaries',
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@tanstack/start-server-core',
              message:
                'Import from a dedicated @tanstack/start-server-core subpath to avoid pulling the full server barrel into the RSC module graph.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ImportExpression[source.value='@tanstack/start-server-core']",
          message:
            'Dynamically import a dedicated @tanstack/start-server-core subpath instead of the root barrel.',
        },
      ],
    },
  },
  {
    files: ['**/__tests__/**'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },
]
