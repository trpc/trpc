import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './content/**/*.{md,mdx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    './mdx-components.tsx',
    './node_modules/fumadocs-ui/dist/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#398ccb',
          dark: '#317eb9',
          darker: '#2c6fa3',
          darkest: '#245d8a',
          light: '#4ca3e0',
          lighter: '#6db8e8',
          lightest: '#9fd0f0',
        },
      },
    },
  },
};

export default config;
