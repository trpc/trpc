import { NextConfig } from 'next';

export default {
  publicRuntimeConfig: {
    APP_URL: process.env.APP_URL ?? 'http://localhost:3000',
    WS_URL: process.env.WS_URL ?? 'ws://localhost:3001',
  },
  eslint: { ignoreDuringBuilds: !!process.env.CI },
} satisfies NextConfig;
