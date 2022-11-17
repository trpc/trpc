/** @type {import("next").NextConfig} */
module.exports = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/all',
        permanent: false,
      },
    ];
  },
  eslint: {
    // We run lint as a separate task in CI
    ignoreDuringBuilds: !!process.env.CI,
  },
};
