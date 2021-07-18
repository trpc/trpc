/**
 * @link https://nextjs.org/docs/api-reference/next.config.js/introduction
 */

const IS_DEV = process.env.NODE_ENV === 'development';
let appUrl = process.env.APP_URL;

if (!appUrl && IS_DEV) {
  appUrl = 'http://localhost:3000';
}
wsUrl = process.env.WS_URL;
if (!wsUrl && IS_DEV) {
  wsUrl = 'ws://localhost:3001';
}

if (!appUrl || !wsUrl) {
  console.error({ wsUrl, appUrl });
  throw new Error('Missing appUrl or wsUrl');
}

module.exports = {
  serverRuntimeConfig: {
    // Will only be available on the server side
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    APP_URL: appUrl,
    WS_URL: wsUrl,
  },
};
