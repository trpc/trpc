import { Effect, Ref, Stream } from 'effect';
import { Persistence } from 'effect/persistence';
import {
  createSerializer,
  jsonTransformer,
  type AnyTransformer,
  type Frame,
} from '@trpc12/trpc/transformer';
import { expect, test } from 'vite-plus/test';
import { makeStreamLog } from './resume.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const later = <T>(value: T, ms: number) => sleep(ms).then(() => value);

/** A feed whose items stream slowly, each with a deferred author. */
const feed = () => ({
  title: 'Feed',
  items: (async function* () {
    for (let i = 1; i <= 4; i++) {
      await sleep(15);
      yield { id: i, author: later({ name: i % 2 ? 'ada' : 'grace' }, 5) };
    }
  })(),
  total: later(4, 80),
});

const expected = {
  title: 'Feed',
  items: [1, 2, 3, 4].map((id) => ({
    id,
    author: { name: id % 2 ? 'ada' : 'grace' },
  })),
  total: 4,
};

async function settle(value: unknown): Promise<unknown> {
  if (value instanceof Promise) return settle(await value);
  if (
    typeof value === 'object' &&
    value !== null &&
    Symbol.asyncIterator in value
  ) {
    const out: unknown[] = [];
    for await (const item of value as AsyncIterable<unknown>)
      out.push(await settle(item));
    return out;
  }
  if (Array.isArray(value)) return Promise.all(value.map(settle));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([k, v]) => [k, await settle(v)]),
      ),
    );
  }
  return value;
}

/** Two instances sharing one store, like two servers behind a load balancer. */
const twoInstances = <A>(
  f: (
    a: Effect.Success<ReturnType<typeof makeStreamLog>>,
    b: Effect.Success<ReturnType<typeof makeStreamLog>>,
  ) => Effect.Effect<A, unknown>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* f(yield* makeStreamLog(), yield* makeStreamLog());
    }).pipe(Effect.scoped, Effect.provide(Persistence.layerBackingMemory)),
  );

for (const [name, serializer] of [
  ['plain JSON', jsonTransformer],
  ['danSON', createSerializer()],
] as [string, AnyTransformer][]) {
  test(`${name}: a call cut after 2 frames resumes on another instance`, async () => {
    let runs = 0;
    const value = await twoInstances((a, b) =>
      Effect.gen(function* () {
        yield* a.start('call-1', serializer, () => (runs++, feed()));
        const received = yield* Ref.make(0);
        const counted = (frames: Stream.Stream<Frame>) =>
          Stream.tap(frames, () => Ref.update(received, (n) => n + 1));
        // Instance A's connection drops after 2 frames; the link asks
        // instance B for the rest, from the next index.
        const frames = Stream.concat(
          counted(a.read('call-1').pipe(Stream.take(2))),
          Stream.unwrap(
            Effect.map(Ref.get(received), (from) =>
              counted(b.read('call-1', from)),
            ),
          ),
        );
        return yield* serializer.deserializeStream<any, never>(frames);
      }),
    );
    expect(await settle(value)).toEqual(expected);
    expect(runs).toBe(1);
  });
}

test('the output keeps streaming into the log after every reader leaves', async () => {
  const value = await twoInstances((a, b) =>
    Effect.gen(function* () {
      yield* a.start('call-2', jsonTransformer, feed);
      yield* Stream.runDrain(a.read('call-2').pipe(Stream.take(1)));
      yield* Effect.promise(() => sleep(150));
      return yield* jsonTransformer.deserializeStream<any, never>(
        b.read('call-2'),
      );
    }),
  );
  expect(await settle(value)).toEqual(expected);
});

test('a second start for the same key runs nothing', async () => {
  let runs = 0;
  const [first, second] = await twoInstances((a, b) =>
    Effect.all([
      a.start('call-3', jsonTransformer, () => (runs++, feed())),
      b.start('call-3', jsonTransformer, () => (runs++, feed())),
    ]),
  );
  expect([first, second, runs]).toEqual([true, false, 1]);
});

test('reading a key with no log dies', async () => {
  await expect(
    twoInstances((a) => Stream.runDrain(a.read('nope'))),
  ).rejects.toThrow('no log for "nope"');
});
