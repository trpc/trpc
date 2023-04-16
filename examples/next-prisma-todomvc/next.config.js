const { i18n } = require('./next-i18next.config');

/** @type {import("next").NextConfig} */
const config = {
  i18n,

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
    ignoreDuringBuilds: !!process.env.CI,
  },
};

module.exports = config;
