/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  images: {
    domains: ['images.clerk.dev', 'avatars.githubusercontent.com'],
  },
};

module.exports = nextConfig;
