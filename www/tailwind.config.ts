import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,jsx,ts,tsx,md,mdx}',
    './docs/**/*.{js,jsx,ts,tsx,md,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          dark: 'var(--ifm-color-primary-dark)',
          darker: 'var(--ifm-color-primary-darker)',
          darkest: 'var(--ifm-color-primary-darkest)',
          DEFAULT: 'var(--ifm-color-primary)',
          light: 'var(--ifm-color-primary-light)',
          lighter: 'var(--ifm-color-primary-lighter)',
          lightest: 'var(--ifm-color-primary-lightest)',
        },
      },
      keyframes: {
        'pop-in': {
          '0%': {
            opacity: '0',
            transform: 'translateY(48px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
      },
      animation: {
        'pop-in': 'pop-in 1s ease-out',
      },
    },
  },
  darkMode: ['class', '[data-theme="dark"]'],
  plugins: [
    /* eslint-disable-next-line */
    require('tailwindcss-elevation')(['responsive']),
  ],
};

export default config;
