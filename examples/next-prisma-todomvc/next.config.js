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

  /** Next.js only knows ESLint; we lint with oxlint as a separate task */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = config;
