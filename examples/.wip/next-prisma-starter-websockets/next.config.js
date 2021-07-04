/**
 * @link https://nextjs.org/docs/api-reference/next.config.js/introduction
 */

const devPort = process.env.NODE_ENV === 'production' ? 3000 : 3001;
module.exports = {
  serverRuntimeConfig: {
    // Will only be available on the server side
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    APP_URL: process.env.APP_URL || `http://localhost:${devPort}`,
  },
};
