import EventEmitter, { on } from 'events';
import { fakeTimersResource } from '@trpc/server/__tests__/fakeTimersResource';
import { expect, vi } from 'vitest';
import { run } from '../../utils';
import { withPing } from './withPing';

type EventMap<T> = Record<keyof T, any[]>;
class IterableEventEmitter<T extends EventMap<T>> extends EventEmitter<T> {
  toIterable<TEventName extends keyof T & string>(
    eventName: TEventName,
    opts?: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<T[TEventName]> {
    return on(this as any, eventName, opts) as any;
  }
}

interface MyEvents {
  message: [str: string];
}

test('yield values from source iterable', async () => {
  const ee = new IterableEventEmitter<MyEvents>();
  using fakeTimers = fakeTimersResource();
  const pingIntervalMs = 1_000;
  const offsetMs = 100;

  const ac = new AbortController();

  const iterable = withPing(
    ee.toIterable('message', {
      signal: ac.signal,
    }),
    pingIntervalMs,
  );
  const iterator = iterable[Symbol.asyncIterator]();

  const values: any[] = [];
  const completed = run(async () => {
    while (true) {
      const result = await iterator.next();

      if (result.done) break;
      values.push(result.value);
    }
  }).catch(() => {
    //
  });

  // Advance timer before ping interval
  await fakeTimers.advanceTimersByTimeAsync(pingIntervalMs - offsetMs);

  ee.emit('message', '1');

  // Advance timer to after ping interval (won't yield anything)
  await fakeTimers.advanceTimersByTimeAsync(offsetMs * 2);

  // yield another value
  ee.emit('message', '2');

  await fakeTimers.advanceTimersByTimeAsync(pingIntervalMs + offsetMs);
  await fakeTimers.advanceTimersByTimeAsync(pingIntervalMs + offsetMs);

  ee.emit('message', '3');

  ac.abort();

  await completed;

  expect(values).toMatchInlineSnapshot(`
    Array [
      Array [
        "1",
      ],
      Array [
        "2",
      ],
      Symbol(ping),
      Symbol(ping),
      Array [
        "3",
      ],
    ]
  `);
});

test('respects return()', async () => {
  let stopped = false;
  async function* gen() {
    let i = 0;
    try {
      while (true) {
        yield i++;

        // wait a tick
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      stopped = true;
    }
  }

  const iterable = withPing(gen(), 50);

  for await (const i of iterable) {
    if (i === 10) break;
  }

  await vi.waitFor(() => {
    expect(stopped).toBe(true);
  });
});
