import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  content: ['./src/components/**/*.{tsx,mdx}', './src/app/**/*.{tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: 'var(--font-inter), system-ui, sans-serif',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [animate, require("tailwindcss-animate")],
} satisfies Config;
