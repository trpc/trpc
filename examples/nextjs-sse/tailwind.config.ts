import type { Config } from 'tailwindcss';

export default {
  content: ['./src/components/**/*.{tsx,mdx}', './src/app/**/*.{tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: 'var(--font-inter), system-ui, sans-serif',
      },
    },
  },
} satisfies Config;
