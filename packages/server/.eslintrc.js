/** @type {import("eslint").Linter.Config} */
const config = {
  root: false,
  overrides: [
    {
      files: ['src'],
      rules: {
        'explicit-module-boundary-types': 'off',
        'no-restricted-imports': [
          'error',
          {
            name: '@trpc/server',
          },
        ],
      },
    },
  ],
};

module.exports = config;
