import { NextConfig } from 'next';

export default {
  serverExternalPackages: ['@trpc/server'],
  transpilePackages: ['@shared/ui'],
} satisfies NextConfig;
