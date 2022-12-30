/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-var-requires */
const { PHASE_PRODUCTION_BUILD } = require('next/constants');

module.exports = (phase, { defaultConfig }) => {
  try {
    // validate env vars
    require('./utils/env');
  } catch (err) {
    if (phase === PHASE_PRODUCTION_BUILD) {
      // throw if prod build
      throw err;
    }
  }
  /**
   * @type {import('next').NextConfig}
   */
  const nextConfig = {
    reactStrictMode: true,
  };

  return nextConfig;
};
