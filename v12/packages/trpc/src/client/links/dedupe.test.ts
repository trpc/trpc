import { Deferred, Effect, Stream } from 'effect';
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  link,
  routerType,
  type BuiltinCallOptions,
  type Operation,
} from '@trpc12/trpc/client';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { error, initTrpc, tracked } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = { stopped: 0 };

class Money {
  readonly cents: number;
  constructor(cents: number) {
    this.cents = cents;
  }
}
const transformer = experimental_createProgressiveJson({
  types: {
    Money: {
      is: (v): v is Money => v instanceof Money,
      serialize: (v: Money) => v.cents,
      deserialize: (v) => new Money(v as number),
    },
  },
});

const router = t.router({
  echo: t.procedure
    .input(z.object({ a: z.number(), b: z.number() }))
    .query(async (opts) => {
      await sleep(10);
      return opts.input;
    }),
  slow: t.procedure.query(async () => {
    await sleep(10);
    return 'ok';
  }),
  failing: t.procedure.query(async () => {
    await sleep(10);
    return error({ code: 'CONFLICT', message: 'broke' });
  }),
  bump: t.procedure.mutation(async () => {
    await sleep(10);
    return 'bumped';
  }),
  feed: t.procedure.query(() => ({
    feed: (async function* () {
      for (const letter of ['a', 'b', 'c']) {
        await sleep(5);
        yield letter;
      }
    })(),
  })),
  price: t.procedure
    .input(z.object({ price: z.instanceof(Money) }))
    .query(async (opts) => {
      await sleep(10);
      return opts.input.price.cents;
    }),
  size: t.procedure
    .input(z.object({ file: z.instanceof(File) }))
    .query(async (opts) => (await opts.input.file.text()).length),
  events: t.procedure
    .input(z.object({ room: z.string() }))
    .subscription(async function* (opts) {
      const start = opts.lastEventId ? Number(opts.lastEventId) + 1 : 1;
      for (let id = start; id <= 3; id++) {
        await sleep(10);
        yield tracked(String(id), `${opts.input.room} ${id}`);
      }
    }),
  forever: t.procedure.subscription(async function* () {
    try {
      for (let n = 0; ; n++) {
        await sleep(5);
        yield n;
      }
    } finally {
      state.stopped++;
    }
  }),
  refused: t.procedure.subscription(async function* () {
    await sleep(10);
    yield* [];
    throw error({ code: 'CONFLICT', message: 'refused' });
  }),
});
type AppRouter = typeof router;

async function setup(opts?: Parameters<typeof dedupeLink>[0]) {
  const server = await createTestServer({ router, transformer });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [dedupeLink(opts), httpLink({ url: server.url, transformer })],
  });
  const sent = (path: string) =>
    server.requests.filter((r) => new URL(r.url).pathname.endsWith(`/${path}`))
      .length;
  return { server, client, sent, [Symbol.asyncDispose]: () => server.close() };
}

/** A client whose last link answers every call with `answer`, recording the ops it gets. */
function stubbed(answer: (op: Operation) => Stream.Stream<unknown>) {
  const ops: Operation[] = [];
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      dedupeLink(),
      link<{ context: Pick<BuiltinCallOptions, 'onResponse'> }>((args) => {
        ops.push(args.op);
        return answer(args.op);
      }),
    ],
  });
  return { client, ops };
}

async function collect<T>(iterable: AsyncIterable<T>) {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

test('queries in flight with deeply equal inputs, in any key order, share one request', async () => {
  await using ctx = await setup();
  const [a, b, other] = await Promise.all([
    ctx.client.echo.query({ a: 1, b: 2 }),
    ctx.client.echo.query({ b: 2, a: 1 }),
    ctx.client.echo.query({ a: 1, b: 3 }),
  ]);
  expect(b).toBe(a);
  expect(other).toEqual({ a: 1, b: 3 });
  expect(ctx.sent('echo')).toBe(2);
  await ctx.client.echo.query({ a: 1, b: 2 });
  expect(ctx.sent('echo')).toBe(3);
});

test('inputs the transformer can not write, a File or a custom type, compare by identity', async () => {
  await using ctx = await setup();
  const file = new File(['abc'], 'a.txt');
  const price = new Money(5);
  await expect(
    Promise.all([
      ctx.client.size.query({ file }),
      ctx.client.size.query({ file }),
      ctx.client.price.query({ price }),
      ctx.client.price.query({ price }),
      ctx.client.price.query({ price: new Money(5) }),
    ]),
  ).resolves.toEqual([3, 3, 5, 5, 5]);
  expect(ctx.sent('size')).toBe(1);
  expect(ctx.sent('price')).toBe(2);
});

test('call options must be equal: headers compare as Headers, init and batch must match', async () => {
  await using ctx = await setup();
  await Promise.all([
    ctx.client.slow.query(undefined, { headers: { 'x-locale': 'sv' } }),
    ctx.client.slow.query(undefined, {
      headers: new Headers([['X-Locale', 'sv']]),
    }),
    ctx.client.slow.query(undefined, { headers: { 'x-locale': 'en' } }),
    ctx.client.slow.query(undefined, { init: { headers: { 'x-a': '1' } } }),
    ctx.client.slow.query(undefined, {
      init: { headers: new Headers({ 'X-A': '1' }) },
    }),
    ctx.client.slow.query(undefined, { init: { redirect: 'error' } }),
    ctx.client.slow.query(undefined, { batch: false }),
  ]);
  expect(ctx.server.requests.map((r) => r.headers.get('x-locale'))).toEqual(
    expect.arrayContaining(['sv', 'en']),
  );
  expect(ctx.sent('slow')).toBe(5);
});

test('mutations and calls with dedupe: false are sent on their own', async () => {
  await using ctx = await setup();
  await Promise.all([
    ctx.client.bump.mutate(),
    ctx.client.bump.mutate(),
    ctx.client.slow.query(),
    ctx.client.slow.query(undefined, { dedupe: false }),
    collect(ctx.client.events.subscribe({ room: 'x' })),
    collect(ctx.client.events.subscribe({ room: 'x' }, { dedupe: false })),
  ]);
  expect(ctx.sent('bump')).toBe(2);
  expect(ctx.sent('slow')).toBe(2);
  expect(ctx.sent('events')).toBe(2);
});

test('key(op) groups calls by its string instead of their inputs', async () => {
  await using ctx = await setup({ key: (op) => op.path });
  const [a, b] = await Promise.all([
    ctx.client.echo.query({ a: 1, b: 2 }),
    ctx.client.echo.query({ a: 3, b: 4 }),
  ]);
  expect(b).toBe(a);
  expect(ctx.sent('echo')).toBe(1);
});

test('subscriptions with the same input and lastEventId share one until its first event', async () => {
  await using ctx = await setup();
  const [a, b, other, resumed] = await Promise.all([
    collect(ctx.client.events.subscribe({ room: 'x' })),
    collect(ctx.client.events.subscribe({ room: 'x' })),
    collect(ctx.client.events.subscribe({ room: 'y' })),
    collect(ctx.client.events.subscribe({ room: 'x' }, { lastEventId: '1' })),
  ]);
  expect(a.map((e) => e.data)).toEqual(['x 1', 'x 2', 'x 3']);
  expect(b).toEqual(a);
  expect(other.map((e) => e.data)).toEqual(['y 1', 'y 2', 'y 3']);
  expect(resumed.map((e) => e.data)).toEqual(['x 2', 'x 3']);
  expect(ctx.sent('events')).toBe(3);
});

test('a subscription made after the first event subscribes on its own', async () => {
  await using ctx = await setup();
  const first = ctx.client.events
    .subscribe({ room: 'x' })
    [Symbol.asyncIterator]();
  expect((await first.next()).value).toMatchObject({ data: 'x 1' });
  const later = collect(ctx.client.events.subscribe({ room: 'x' }));
  const rest = collect({ [Symbol.asyncIterator]: () => first });
  expect((await later).map((e) => e.data)).toEqual(['x 1', 'x 2', 'x 3']);
  expect((await rest).map((e) => e.data)).toEqual(['x 2', 'x 3']);
  expect(ctx.sent('events')).toBe(2);
});

test('a caller that stops leaves the others reading; the request stops after the last', async () => {
  await using ctx = await setup();
  const before = state.stopped;
  const controller = new AbortController();
  const a = collect(
    ctx.client.forever.subscribe(undefined, { signal: controller.signal }),
  );
  const b = ctx.client.forever.subscribe()[Symbol.asyncIterator]();
  expect(await b.next()).toEqual({ done: false, value: 0 });
  controller.abort();
  await expect(a).resolves.toEqual([0]);
  expect(await b.next()).toEqual({ done: false, value: 1 });
  expect(state.stopped).toBe(before);
  await b.return?.();
  await vi.waitFor(() => expect(state.stopped).toBe(before + 1));
  expect(ctx.sent('forever')).toBe(1);
});

test("the request's signal aborts once every caller still in it has aborted, so a value already sent still reads", async () => {
  let interrupted = 0;
  const stub = stubbed(() =>
    Stream.fromEffect(
      Effect.sleep(20).pipe(
        Effect.as('late'),
        Effect.onInterrupt(() => Effect.sync(() => interrupted++)),
      ),
    ),
  );
  const [first, second, third] = [1, 2, 3].map(() => new AbortController());
  const a = stub.client.slow.query(undefined, { signal: first!.signal });
  const b = stub.client.slow.query(undefined, { signal: second!.signal });
  first!.abort();
  await expect(a).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  await expect(b).resolves.toBe('late');
  expect(stub.ops[0]!.signal!.aborted).toBe(false);
  // `b` has left: its signal no longer reaches the request.
  second!.abort();
  expect(stub.ops[0]!.signal!.aborted).toBe(false);

  const c = stub.client.slow.query(undefined, { signal: third!.signal });
  await sleep(5);
  third!.abort();
  await expect(c).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect(stub.ops[1]!.signal!.aborted).toBe(true);
  await vi.waitFor(() => expect(interrupted).toBe(1));
});

test("a caller that stops reading stops counting: the others' signals abort the request", async () => {
  const stub = stubbed(() =>
    Stream.concat(
      Stream.fromEffect(Effect.as(Effect.sleep(10), 1)),
      Stream.never,
    ),
  );
  const controller = new AbortController();
  const a = stub.client.forever.subscribe()[Symbol.asyncIterator]();
  const first = a.next();
  const b = collect(
    stub.client.forever.subscribe(undefined, { signal: controller.signal }),
  );
  expect(await first).toEqual({ done: false, value: 1 });
  await a.return?.();
  expect(stub.ops).toHaveLength(1);
  expect(stub.ops[0]!.signal!.aborted).toBe(false);
  controller.abort();
  await expect(b).resolves.toEqual([1]);
  expect(stub.ops[0]!.signal!.aborted).toBe(true);
});

test('aborting mid-stream ends only that caller, and its signal keeps no listener; the last one aborts the request', async () => {
  const stub = stubbed(() =>
    Stream.iterate(0, (n) => n + 1).pipe(Stream.tap(() => Effect.sleep(5))),
  );
  const listening = (signal: AbortSignal) => {
    const added = vi.spyOn(signal, 'addEventListener');
    const removed = vi.spyOn(signal, 'removeEventListener');
    return () => {
      const live = new Set(added.mock.calls.map((call) => call[1]));
      for (const call of removed.mock.calls) live.delete(call[1]);
      return live.size;
    };
  };
  const [first, second] = [new AbortController(), new AbortController()];
  const firstLive = listening(first.signal);
  const secondLive = listening(second.signal);
  const a = stub.client.forever
    .subscribe(undefined, { signal: first.signal })
    [Symbol.asyncIterator]();
  const b = stub.client.forever
    .subscribe(undefined, { signal: second.signal })
    [Symbol.asyncIterator]();
  expect(await Promise.all([a.next(), b.next()])).toEqual([
    { done: false, value: 0 },
    { done: false, value: 0 },
  ]);
  expect(firstLive()).toBeGreaterThan(0);

  first.abort();
  await expect(a.next()).resolves.toMatchObject({ done: true });
  expect((await b.next()).value).toBeGreaterThan(0);
  expect(stub.ops).toHaveLength(1);
  expect(stub.ops[0]!.signal!.aborted).toBe(false);
  await vi.waitFor(() => expect(firstLive()).toBe(0));

  second.abort();
  await expect(b.next()).resolves.toMatchObject({ done: true });
  expect(stub.ops[0]!.signal!.aborted).toBe(true);
  await vi.waitFor(() => expect(secondLive()).toBe(0));
});

test('a caller that leaves removes its abort listener, so a long-lived signal keeps no request', async () => {
  const stub = stubbed(() => Stream.fromEffect(Effect.as(Effect.sleep(5), 7)));
  const signal = new AbortController().signal;
  const added = vi.spyOn(signal, 'addEventListener');
  const removed = vi.spyOn(signal, 'removeEventListener');
  for (let round = 0; round < 3; round++) {
    await expect(
      Promise.all([
        stub.client.slow.query(undefined, { signal }),
        stub.client.slow.query(undefined, { signal }),
      ]),
    ).resolves.toEqual([7, 7]);
  }
  expect(stub.ops).toHaveLength(3);
  const listening = new Set(added.mock.calls.map((call) => call[1]));
  for (const call of removed.mock.calls) listening.delete(call[1]);
  expect(listening.size).toBe(0);
  expect(added.mock.calls.length).toBeGreaterThanOrEqual(6);
});

test('a signal an earlier link sets aborts the request while its caller still waits', async () => {
  const own = new AbortController();
  const answer = Deferred.makeUnsafe<string>();
  const ops: Operation[] = [];
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      link((args) => args.next({ ...args.op, signal: own.signal })),
      dedupeLink(),
      link((args) => {
        ops.push(args.op);
        return Stream.fromEffect(Deferred.await(answer));
      }),
    ],
  });
  const call = client.slow.query();
  await vi.waitFor(() => expect(ops).toHaveLength(1));
  own.abort();
  await vi.waitFor(() => expect(ops[0]!.signal!.aborted).toBe(true));
  Deferred.doneUnsafe(answer, Effect.succeed('late'));
  await expect(call).resolves.toBe('late');
});

test('a call made once every caller has left sends its own request', async () => {
  const stub = stubbed(() => Stream.fromEffect(Effect.as(Effect.sleep(20), 7)));
  const controller = new AbortController();
  const left = stub.client.slow.query(undefined, { signal: controller.signal });
  controller.abort();
  const next = stub.client.slow.query();
  await expect(left).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  await expect(next).resolves.toBe(7);
  expect(stub.ops.at(-1)!.signal!.aborted).toBe(false);
});

test('a request that ends after an identical one opened leaves that one joinable', async () => {
  const firstEnds = Deferred.makeUnsafe<void>();
  const secondAnswers = Deferred.makeUnsafe<number>();
  const stub = stubbed((op) => {
    if (stub.ops.length === 1) {
      return Stream.concat(
        Stream.make(1),
        Stream.drain(Stream.fromEffect(Deferred.await(firstEnds))),
      );
    }
    op.context.onResponse?.({ status: 200, headers: new Headers() });
    return Stream.fromEffect(Deferred.await(secondAnswers));
  });
  const a = stub.client.forever.subscribe()[Symbol.asyncIterator]();
  expect(await a.next()).toEqual({ done: false, value: 1 });
  const b = collect(stub.client.forever.subscribe());
  await vi.waitFor(() => expect(stub.ops).toHaveLength(2));
  Deferred.doneUnsafe(firstEnds, Effect.void);
  expect(await a.next()).toEqual({ done: true, value: undefined });
  const joined = Deferred.makeUnsafe<void>();
  const c = collect(
    stub.client.forever.subscribe(undefined, {
      onResponse: () => Deferred.doneUnsafe(joined, Effect.void),
    }),
  );
  await Effect.runPromise(Deferred.await(joined));
  Deferred.doneUnsafe(secondAnswers, Effect.succeed(2));
  await expect(Promise.all([b, c])).resolves.toEqual([[2], [2]]);
  expect(stub.ops).toHaveLength(2);
});

test('a call made in the tick the request answers is told once and gets the value', async () => {
  const sent = Deferred.makeUnsafe<void>();
  const answer = Deferred.makeUnsafe<number>();
  const stub = stubbed((op) => {
    op.context.onResponse?.({ status: 203, headers: new Headers() });
    Deferred.doneUnsafe(sent, Effect.void);
    return Stream.fromEffect(Deferred.await(answer));
  });
  const statuses: string[] = [];
  const a = stub.client.slow.query();
  await Effect.runPromise(Deferred.await(sent));
  const b = stub.client.slow.query(undefined, {
    onResponse: (meta) => void statuses.push(`b ${meta.status}`),
  });
  Deferred.doneUnsafe(answer, Effect.succeed(7));
  await expect(Promise.all([a, b])).resolves.toEqual([7, 7]);
  expect(statuses).toEqual(['b 203']);
});

test('an error reaches every caller', async () => {
  await using ctx = await setup();
  const results = await Promise.allSettled([
    ctx.client.failing.query(),
    ctx.client.failing.query(),
    collect(ctx.client.refused.subscribe()),
    collect(ctx.client.refused.subscribe()),
  ]);
  expect(results).toMatchObject(
    Array.from({ length: 4 }, () => ({
      status: 'rejected',
      reason: { code: 'CONFLICT' },
    })),
  );
  expect(ctx.sent('failing')).toBe(1);
  expect(ctx.sent('refused')).toBe(1);
});

test('each caller gets onResponse, also for one sent before it joined; one that throws fails only its own call', async () => {
  const answer = Deferred.makeUnsafe<number>();
  const stub = stubbed((op) =>
    Stream.unwrap(
      Effect.sync(() => {
        op.context.onResponse?.({ status: 203, headers: new Headers() });
        return Stream.fromEffect(Deferred.await(answer));
      }),
    ),
  );
  const statuses: string[] = [];
  const throws = () => {
    throw new Error('nope');
  };
  /** An `onResponse` that records `name`'s status, and `heard` once it ran. */
  const listener = (name: string, then = () => {}) => {
    const heard = Deferred.makeUnsafe<void>();
    return {
      heard: Effect.runPromise(Deferred.await(heard)),
      onResponse: (meta: { status: number }) => {
        statuses.push(`${name} ${meta.status}`);
        Deferred.doneUnsafe(heard, Effect.void);
        then();
      },
    };
  };
  const [a, b, c] = [listener('a'), listener('b'), listener('c', throws)];
  const first = stub.client.slow.query(undefined, { onResponse: a.onResponse });
  await a.heard;
  const joined = [
    stub.client.slow.query(undefined, { onResponse: b.onResponse }),
    stub.client.slow.query(undefined, { onResponse: c.onResponse }),
  ];
  await Promise.all([b.heard, c.heard]);
  Deferred.doneUnsafe(answer, Effect.succeed(7));
  const results = await Promise.allSettled([first, ...joined]);
  expect(statuses).toEqual(['a 203', 'b 203', 'c 203']);
  expect(results).toMatchObject([
    { status: 'fulfilled', value: 7 },
    { status: 'fulfilled', value: 7 },
    { status: 'rejected', reason: { code: 'CLIENT_ERROR', message: 'nope' } },
  ]);
  await expect(
    collect(stub.client.forever.subscribe(undefined, { onResponse: throws })),
  ).rejects.toMatchObject({ message: 'nope' });
  expect(stub.ops).toHaveLength(2);
});

test("a stream in a query's output is one stream for every caller", async () => {
  await using ctx = await setup();
  const [a, b, own] = await Promise.all([
    ctx.client.feed.query(),
    ctx.client.feed.query(),
    ctx.client.feed.query(undefined, { dedupe: false }),
  ]);
  expect(b.feed).toBe(a.feed);
  expect(await collect(a.feed)).toEqual(['a', 'b', 'c']);
  expect(await collect(own.feed)).toEqual(['a', 'b', 'c']);
  expect(ctx.sent('feed')).toBe(2);
});
