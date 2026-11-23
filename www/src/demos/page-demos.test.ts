import { describe, expect, it } from 'vitest';

import { withStatus } from './page-demos.tsx';

describe('withStatus', () => {
  it('marks a fulfilled promise for use()', async () => {
    const promise = withStatus(Promise.resolve('demo'));
    await promise;
    expect(promise).toMatchObject({ status: 'fulfilled', value: 'demo' });
  });

  // Regression: a demo's chunk a deploy has replaced (`WWW-C` in Sentry)
  // failed to load, and marking it rejected made a second promise, with
  // the same reason, that nothing handled.
  it('marks a rejected promise without an unhandled rejection of its own', async () => {
    const unhandled: Array<unknown> = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const reason = new TypeError(
        'Failed to fetch dynamically imported module',
      );
      const promise = withStatus(Promise.reject(reason));
      await promise.catch(() => {});
      // Unhandled rejections are reported after the microtask queue drains.
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(promise).toMatchObject({ reason, status: 'rejected' });
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
