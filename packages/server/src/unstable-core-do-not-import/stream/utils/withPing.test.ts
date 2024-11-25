import EventEmitter, { on } from 'events';
import { konn } from 'konn';
import { expect, vi } from 'vitest';
import { run } from '../../utils';
import { timerResource } from './timerResource';
import { withPing } from './withPing';

export interface MyEvents {
  message: (str: string) => void;
}
declare interface MyEventEmitter {
  on<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  off<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  once<TEv extends keyof MyEvents>(event: TEv, listener: MyEvents[TEv]): this;
  emit<TEv extends keyof MyEvents>(
    event: TEv,
    ...args: Parameters<MyEvents[TEv]>
  ): boolean;
}

class MyEventEmitter extends EventEmitter {
  public toIterable<TEv extends keyof MyEvents>(
    event: TEv,
    opts: NonNullable<Parameters<typeof on>[2]>,
  ): AsyncIterable<Parameters<MyEvents[TEv]>> {
    return on(this, event, opts) as any;
  }
}

function fakeTimersResource() {
  vi.useFakeTimers();

  return {
    advanceTimersByTimeAsync: vi.advanceTimersByTimeAsync,
    [Symbol.dispose]: () => {
      vi.useRealTimers();
    },
  };
}

test('yield values from source iterable', async () => {
  const ee = new MyEventEmitter();
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
