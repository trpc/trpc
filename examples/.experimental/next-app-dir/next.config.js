/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    appDir: true,
    serverActions: true,
  },
  webpack: (config) => {
    config.experiments.topLevelAwait = true;
    return config;
  },
};

module.exports = nextConfig;
