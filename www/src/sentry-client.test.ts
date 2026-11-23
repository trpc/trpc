import { describe, expect, it } from '@effect/vitest';

import { type Capture, lazyCapture, type Reported } from './sentry-client.ts';

const reported = (message: string): Reported => ({
  error: new Error(message),
  source: 'onerror',
});

function deferredCapture() {
  const captured: Array<Reported> = [];
  let loads = 0;
  let resolve: (capture: Capture) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const load = () => {
    loads += 1;
    return new Promise<Capture>((onLoad, onFail) => {
      resolve = onLoad;
      reject = onFail;
    });
  };
  return {
    captured,
    fail: () => reject(new Error('blocked')),
    load,
    loads: () => loads,
    ready: () => resolve((one) => captured.push(one)),
  };
}

describe('lazyCapture', () => {
  it('queues reports until the SDK loads, then sends them in order', async () => {
    const sdk = deferredCapture();
    const sentry = lazyCapture(sdk.load);
    const first = reported('first');
    const second = reported('second');
    sentry.report(first);
    sentry.report(second);
    expect(sdk.captured).toEqual([]);
    sdk.ready();
    await sentry.start();
    const third = reported('third');
    sentry.report(third);
    expect(sdk.captured).toEqual([first, second, third]);
  });

  it('loads at the first report, or on start, and only once', async () => {
    const sdk = deferredCapture();
    const sentry = lazyCapture(sdk.load);
    expect(sdk.loads()).toBe(0);
    sentry.report(reported('one'));
    sentry.report(reported('two'));
    void sentry.start();
    expect(sdk.loads()).toBe(1);
    sdk.ready();
    await sentry.start();
    expect(sdk.loads()).toBe(1);

    const idle = deferredCapture();
    void lazyCapture(idle.load).start();
    expect(idle.loads()).toBe(1);
  });

  it('drops reports when the SDK fails to load', async () => {
    const sdk = deferredCapture();
    const sentry = lazyCapture(sdk.load);
    sentry.report(reported('queued'));
    sdk.fail();
    await sentry.start();
    sentry.report(reported('later'));
    expect(sdk.captured).toEqual([]);
    expect(sdk.loads()).toBe(1);
  });
});
