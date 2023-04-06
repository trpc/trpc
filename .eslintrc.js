/** @type {import("eslint").Linter.Config} */
const config = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['no-only-tests', 'unicorn', 'turbo'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier',
  ],
  parserOptions: {
    ecmaVersion: 2018, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of import
    tsconfigRootDir: __dirname,
    project: [
      './examples/.interop/*/tsconfig.json',
      './examples/.test/*/tsconfig.json',
      './examples/*/tsconfig.json',
      './packages/*/tsconfig.json',
      './tsconfig.json',
      './www/tsconfig.json',
    ], // Allows for the use of rules which require parserServices to be generated
  },
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    'no-only-tests/no-only-tests': 'error',
    '@typescript-eslint/no-empty-interface': 'off',
    'unicorn/filename-case': [
      'error',
      {
        case: 'camelCase',
        ignore: [
          'TRPC',
          'RPC',
          'HTTP',
          '\\.config\\.js',
          '\\.d\\.ts$',
          'issue-\\d+-.*\\.test\\.tsx?$',
          '\\.(t|j)sx$',
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
          regex: '^(T|\\$)[A-Z][a-zA-Z]+[0-9]*$',
          match: true,
        },
      },
    ],
  },
  overrides: [
    // {
    //   files: ['www/**/*', 'examples/next-prisma-websockets-starter/**/*'],
    //   extends: ['plugin:tailwindcss/recommended'],
    //   rules: {
    //     'tailwindcss/classnames-order': 'error',
    //     'tailwindcss/enforces-negative-arbitrary-values': 'error',
    //     'tailwindcss/enforces-shorthand': 'error',
    //     'tailwindcss/no-arbitrary-value': 'warn',
    //   },
    // },
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
      },
    },
    {
      files: ['packages/**/*'],
      rules: {
        'no-console': 'error',
      },
    },
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
};

module.exports = config;
