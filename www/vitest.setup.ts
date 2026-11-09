/**
 * Fails a test that fetches anything but a server on this machine. A
 * request to the internet is slow, or fails, now and then in CI, so a
 * test that makes one flakes. Mock what fetches it, or serve it on
 * 127.0.0.1, as `src/og/fake-avatars.ts` does.
 */
import { afterAll, afterEach } from 'vitest';

const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);
const realFetch = globalThis.fetch;
const reached: Array<string> = [];

// Not `vi.stubGlobal`: a test's `vi.unstubAllGlobals()` would undo it.
// `Object.assign` keeps what else `fetch` has, such as Bun's `preconnect`,
// whose types the workspace installs.
globalThis.fetch = Object.assign(
  async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (loopback.has(url.hostname)) {
      return realFetch(input, init);
    }
    reached.push(url.href);
    throw new TypeError(`Tests are offline: ${url.href}`);
  },
  realFetch,
);

const failIfReached = () => {
  const urls = reached.splice(0);
  if (urls.length > 0) {
    throw new Error(
      `The test fetched ${urls.join(', ')}. Mock it, or serve it on 127.0.0.1.`,
    );
  }
};

afterEach(failIfReached);
// Registered first, so it runs after the file's own `afterAll`s.
afterAll(failIfReached);
