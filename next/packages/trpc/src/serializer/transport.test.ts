import { Effect, Stream } from 'effect';
import {
  createSerializer,
  DansonError,
  jsonSerializer,
  type Frame,
  type Serializer,
} from '@trpc12/trpc/serializer';
import { expect, test } from 'vite-plus/test';

/**
 * A transport of your own, with the public `Serializer` API: frames go
 * through JSON text, as over a socket, and come back as values.
 */
const send = (
  serializer: Serializer<any>,
  value: unknown,
  wire: (
    frames: Stream.Stream<Frame, unknown>,
  ) => Stream.Stream<Frame, unknown>,
) => {
  const serialized = serializer.serializeDeferred(value);
  const frames = (
    serialized.chunks
      ? Stream.concat(Stream.make(serialized.head), serialized.chunks)
      : Stream.make(serialized.head)
  ).pipe(Stream.map((f) => JSON.parse(JSON.stringify(f)) as Frame));
  return Effect.runPromise(
    serializer.deserializeStream<any, unknown>(wire(frames)),
  );
};
const intact = <T>(frames: T) => frames;

for (const serializer of [createSerializer(), jsonSerializer]) {
  test(`${serializer.name}: deferred values travel over a custom transport`, async () => {
    const out = await send(
      serializer,
      {
        later: Promise.resolve('later'),
        refused: Promise.reject({ reason: 'nope' }),
        items: (async function* () {
          yield 1;
          return 'done';
        })(),
      },
      intact,
    );
    await expect(out.later).resolves.toBe('later');
    // Without reviveError, a rejection arrives as it was sent.
    await expect(out.refused).rejects.toEqual({ reason: 'nope' });
    const items: unknown[] = [];
    for await (const item of out.items as AsyncIterable<unknown>) {
      items.push(item);
    }
    expect(items).toEqual([1]);
  });

  test(`${serializer.name}: a transport that ends early or dies fails what is open`, async () => {
    const pending = () => ({ p: new Promise(() => {}) });
    const early = await send(serializer, pending(), (frames) =>
      Stream.take(frames, 1),
    );
    await expect(early.p).rejects.toThrow(
      new DansonError('Stream interrupted'),
    );

    const died = await send(serializer, pending(), (frames) =>
      Stream.concat(Stream.take(frames, 1), Stream.die(new Error('lost'))),
    );
    await expect(died.p).rejects.toMatchObject({
      message: 'Stream failed',
      cause: { message: 'lost' },
    });

    // The transport's own failures reach open values as they are.
    const failed = await send(serializer, pending(), (frames) =>
      Stream.concat(Stream.take(frames, 1), Stream.fail('offline')),
    );
    await expect(failed.p).rejects.toBe('offline');
  });

  test(`${serializer.name}: without coerceError, a value that can't be written fails the stream`, async () => {
    // JSON can't write a bigint, danSON can't write a symbol.
    const unwritable = serializer === jsonSerializer ? 1n : Symbol('x');
    const out = await send(
      serializer,
      { p: Promise.resolve(unwritable), q: new Promise(() => {}) },
      intact,
    );
    await expect(out.p).rejects.toMatchObject({ message: 'Stream failed' });
    await expect(out.q).rejects.toMatchObject({ message: 'Stream failed' });
  });
}
