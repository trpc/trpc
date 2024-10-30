import { NextConfig } from 'next';

export default {
  eslint: {
    ignoreDuringBuilds: true,
  },
  serverExternalPackages: ['@trpc/server'],
  webpack: (config) => {
    // This is only intended to pass CI and should be skiped in your app
    if (config.name === 'server')
      config.optimization.concatenateModules = false;

    return config;
  },
} satisfies NextConfig;
