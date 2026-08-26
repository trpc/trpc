/** @type {import("next").NextConfig} */
const config = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/all',
        permanent: false,
      },
    ];
  },

  /** We run eslint as a separate task in CI */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = config;
