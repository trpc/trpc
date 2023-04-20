/* Add polyfill for fetch for Node < 18.
 * (Stackblitz runs Node 16 and we want embed to work)
 * If you're on Node 18, you don't need this.
 */

if (!global.fetch) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  global.fetch = require('undici').fetch;
}
