const path = require('path');
/**
 * @link https://nextjs.org/docs/api-reference/next.config.js/introduction
 * @type {import('next').NextConfig}
 */
module.exports = {
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      react: path.resolve('./node_modules/react'),
      'react-dom': path.resolve('./node_modules/react-dom'),
    };
    return config;
  },
};
