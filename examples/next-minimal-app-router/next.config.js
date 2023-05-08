/** @type {import("next").NextConfig} */
const config = {
  eslint: { ignoreDuringBuilds: true },
  experimental: { serverActions: true },
};

module.exports = config;
