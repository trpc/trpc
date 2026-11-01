import { NextConfig } from 'next';

export default {
  publicRuntimeConfig: {
    APP_URL: process.env.APP_URL ?? 'http://localhost:3000',
    WS_URL: process.env.WS_URL ?? 'ws://localhost:3001',
  },
  /** Next.js only knows ESLint; we lint with oxlint as a separate task */
  eslint: { ignoreDuringBuilds: true },
} satisfies NextConfig;
