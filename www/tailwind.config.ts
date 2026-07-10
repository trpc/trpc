import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: [
    './src/**/*.{js,jsx,ts,tsx,md,mdx}',
    './docs/**/*.{js,jsx,ts,tsx,md,mdx}',
    './blog/**/*.{js,jsx,ts,tsx,md,mdx}',
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
        loader: {
          to: {
            opacity: '0.1',
            transform: 'translateY(-1rem)',
          },
        },
        'infinite-scroll': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-100%)' },
        },
      },
      animation: {
        'pop-in': 'pop-in 1s ease-out',
        loader: 'loader 0.6s infinite alternate',
        'infinite-scroll': 'infinite-scroll 25s linear infinite',
      },
    },
  },
  darkMode: ['class', '[data-theme="dark"]'],
  plugins: [
    plugin(function ({ matchUtilities, theme }) {
      matchUtilities(
        {
          'animation-delay': (value) => ({
            'animation-delay': value,
          }),
        },
        { values: theme('transitionDelay') },
      );
    }),
    require('tailwindcss-elevation')(['responsive']),
  ],
};

export default config;
