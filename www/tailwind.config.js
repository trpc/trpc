module.exports = {
  content: [
    //
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
        },
      },
    },
  },
  plugins: [],
};
