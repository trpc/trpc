/**
 * @link https://nextjs.org/docs/api-reference/next.config.js/introduction
 */

let appUrl = process.env.APP_URL;
if (!appUrl && process.env.HEROKU_APP_NAME && process.env.HEROKU_PR_NUMBER) {
  appUrl = `https://${process.env.HEROKU_APP_NAME}-pr-${process.env.HEROKU_PR_NUMBER}.herokuapp.com`;
}

module.exports = {
  serverRuntimeConfig: {
    // Will only be available on the server side
  },
  publicRuntimeConfig: {
    // Will be available on both server and client
    APP_URL: appUrl,
    WS_URL: process.env.WS_URL,
  },
};
