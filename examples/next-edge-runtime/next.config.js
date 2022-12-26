/** @type {import("next").NextConfig} */
module.exports = {
  eslint: {
    // We run lint as a separate task in CI
    ignoreDuringBuilds: !!process.env.CI,
  },
};
