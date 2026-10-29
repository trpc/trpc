// @vitest-environment node
import { getEventListeners } from 'node:events';
import { expect, test } from 'vitest';
import { raceAbortSignals, raceAbortSignalsWithCleanup } from './signals';

test.each([false, true])(
  'race cleans up other inputs, pre-aborted = %s',
  (preAborted) => {
    const first = new AbortController();
    const second = new AbortController();
    const third = new AbortController();
    if (preAborted) second.abort();
    const signal = raceAbortSignals(first.signal, second.signal, third.signal);
    if (!preAborted) second.abort();
    expect(signal.aborted).toBe(true);
    for (const controller of [first, second, third]) {
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    }
  },
);

test('cleanup is idempotent and does not abort the composed signal', () => {
  const controller = new AbortController();
  const { signal, cleanup } = raceAbortSignalsWithCleanup(
    null,
    controller.signal,
    undefined,
  );
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);
  cleanup();
  cleanup();
  controller.abort();
  expect(signal.aborted).toBe(false);
  expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});
