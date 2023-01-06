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
  /** We run eslint as a separate task in CI */
  eslint: { ignoreDuringBuilds: !!process.env.CI },
};
