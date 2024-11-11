import EventEmitter, { on } from 'events';
import { konn } from 'konn';
import { expect, vi } from 'vitest';
import { run } from '../../utils';
import { withPing } from './asyncIterable';

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

const ctx = konn()
  .beforeEach(() => {
    const ee = new MyEventEmitter();

    vi.useFakeTimers();

    return {
      ee,
    };
  })
  .afterEach(() => {
    vi.useRealTimers();
  })
  .done();

test('withPing yields values from source iterable', async () => {
  const { ee } = ctx;
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
  await vi.advanceTimersByTimeAsync(pingIntervalMs - offsetMs);

  ee.emit('message', '1');

  // Advance timer to after ping interval (won't yield anything)
  await vi.advanceTimersByTimeAsync(offsetMs * 2);

  // yield another value
  ee.emit('message', '2');

  await vi.advanceTimersByTimeAsync(pingIntervalMs + offsetMs);
  await vi.advanceTimersByTimeAsync(pingIntervalMs + offsetMs);

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
