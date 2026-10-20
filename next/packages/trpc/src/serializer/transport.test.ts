import { Effect, Stream } from 'effect';
import {
  createSerializer,
  DansonError,
  deserializeStream,
  jsonSerializer,
  serializeDeferred,
  type Frame,
  type JsonForm,
  type Serializer,
} from '@trpc12/trpc/serializer';
import { expect, test } from 'vite-plus/test';

/**
 * A transport of your own, with the public serializer API: frames go
 * through JSON text, as over a socket, and come back as values.
 */
const send = (
  serializer: Serializer<any>,
  value: unknown,
  wire: (
    frames: Stream.Stream<Frame, unknown>,
  ) => Stream.Stream<Frame, unknown>,
) => {
  const serialized = serializeDeferred(serializer, value);
  const frames = (
    serialized.chunks
      ? Stream.concat(Stream.make(serialized.head), serialized.chunks)
      : Stream.make(serialized.head)
  ).pipe(Stream.map((f) => JSON.parse(JSON.stringify(f)) as Frame));
  return Effect.runPromise(
    deserializeStream<any, unknown>(serializer, wire(frames)),
  );
};
const intact = <T>(frames: T) => frames;

/** A serializer of your own: whole values only, the transport frames the rest. */
const custom: Serializer<JsonForm> = {
  name: 'custom',
  kind: 'none',
  serialize: (value) => {
    const text = JSON.stringify(value);
    return text === undefined ? {} : { json: JSON.parse(text) };
  },
  deserialize: (value) => value.json as never,
};

for (const serializer of [createSerializer(), jsonSerializer, custom]) {
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
    const unwritable = serializer.kind === 'streaming' ? Symbol('x') : 1n;
    const out = await send(
      serializer,
      { p: Promise.resolve(unwritable), q: new Promise(() => {}) },
      intact,
    );
    await expect(out.p).rejects.toMatchObject({ message: 'Stream failed' });
    await expect(out.q).rejects.toMatchObject({ message: 'Stream failed' });
  });
}
