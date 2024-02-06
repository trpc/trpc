import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import { fontFamily } from 'tailwindcss/defaultTheme';

const fromVariable = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', ...fontFamily.sans],
      },
      colors: {
        border: fromVariable('border'),
        input: fromVariable('input'),
        ring: fromVariable('ring'),
        background: {
          DEFAULT: fromVariable('background'),
          muted: fromVariable('background-muted'),
        },
        foreground: {
          DEFAULT: fromVariable('foreground'),
          muted: fromVariable('foreground-muted'),
        },
        primary: {
          DEFAULT: fromVariable('primary'),
          foreground: fromVariable('primary-foreground'),
        },
        secondary: {
          DEFAULT: fromVariable('secondary'),
          foreground: fromVariable('secondary-foreground'),
        },
        destructive: {
          DEFAULT: fromVariable('destructive'),
          foreground: fromVariable('destructive-foreground'),
        },
        accent: {
          DEFAULT: fromVariable('accent'),
          foreground: fromVariable('accent-foreground'),
        },
        popover: {
          DEFAULT: fromVariable('popover'),
          foreground: fromVariable('popover-foreground'),
        },
        card: {
          DEFAULT: fromVariable('card'),
          foreground: fromVariable('card-foreground'),
        },
      },
      divideColor: { DEFAULT: fromVariable('border') },
      borderColor: { DEFAULT: fromVariable('border') },
      borderRadius: {
        xl: `calc(var(--radius) + 4px)`,
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
