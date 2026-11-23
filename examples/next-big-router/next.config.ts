import { NextConfig } from 'next';

export default {
  /** Next.js only knows ESLint; we lint with oxlint as a separate task */
  eslint: { ignoreDuringBuilds: true },
} satisfies NextConfig;
