/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [{
      hostname: 'avatars.githubusercontent.com',
      protocol: 'https',
    }]
  },
};

module.exports = nextConfig;
