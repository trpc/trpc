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
          normal: '#2596be',
          dark: '#0c7da5',
          darker: '#00638b',
          darkest: '#004a72',
        },
      },
    },
  },
  plugins: [],
};
