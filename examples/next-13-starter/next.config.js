/** @type {import('next').NextConfig} */
const nextConfig = {
  // eslint: {
  //   ignoreDuringBuilds: true,
  // },
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['images.clerk.dev', 'avatars.githubusercontent.com'],
  },
};

module.exports = nextConfig;
