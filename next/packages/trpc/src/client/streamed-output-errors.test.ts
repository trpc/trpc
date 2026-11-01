import { Effect, Stream } from 'effect';
import {
  createSafeClient,
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
  safe,
  wsLink,
  type AtLeastOneLink,
  type AnyTrpcError,
  type LinkErrorCode,
  type SafeResult,
  type TrpcIterable,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import {
  createRouterClient,
  error,
  initTrpc,
  stream,
  type ErrorMapInput,
} from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

const t = initTrpc();
const SoldOut = {
  SOLD_OUT: { data: z.object({ sku: z.string() }) },
} satisfies ErrorMapInput;

const router = t.router({
  feed: t.procedure.query(() =>
    Stream.fromIterable([1, 2]).pipe(
      Stream.concat(Stream.fail(error({ code: 'GONE', data: { at: 2 } }))),
    ),
  ),
  checkout: t.procedure
    .errors(SoldOut)
    .mutation((opts) =>
      Stream.make('reserved').pipe(
        Stream.concat(
          Stream.fail(opts.errors.SOLD_OUT({ data: { sku: 'a1' } })),
        ),
      ),
    ),
  validated: t.procedure
    .output(stream(z.number()))
    .errors(SoldOut)
    .query((opts) =>
      Stream.make(1).pipe(
        Stream.concat(
          Stream.fail(opts.errors.SOLD_OUT({ data: { sku: 'b2' } })),
        ),
      ),
    ),
  generator: t.procedure.query(async function* () {
    yield 1;
  }),
  plain: t.procedure.query(() => ({ n: 1 })),
  ticks: t.procedure.subscription(() =>
    Stream.fromIterable([1]).pipe(
      Stream.concat(Stream.fail(error({ code: 'GONE' }))),
    ),
  ),
});
type AppRouter = typeof router;

type ErrorOf<T> = T extends { readonly '~error'?: infer E } ? E : never;
type CodeOf<E> = E extends { readonly code: infer C } ? C : never;
type DefinedCodeOf<E> = CodeOf<Extract<E, { readonly defined: true }>>;

const offline = {
  NETWORK_ERROR: () => 'offline',
  BAD_RESPONSE: () => 'bad response',
  STREAM_INTERRUPTED: () => 'cut',
  unexpected: (e: AnyTrpcError) => e.message,
} satisfies Record<string, (e: AnyTrpcError) => string>;

/** Each step of `safe(iterable)`, and the error that ended it. */
const steps = async <T, E>(
  iterable: AsyncIterable<[T, E] | [undefined, E]>,
) => {
  const items: unknown[] = [];
  for await (const [item, err] of iterable) {
    if (err) return { items, err };
    items.push(item);
  }
  return { items, err: undefined };
};

test("a streamed output carries its stream's failures in the call's errors and its iterable's", async () => {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: 'http://localhost/trpc' })],
  });
  type Feed = Awaited<ReturnType<typeof client.feed.query>>;
  expectTypeOf<Feed>().toExtend<AsyncIterable<number>>();
  expectTypeOf<DefinedCodeOf<ErrorOf<Feed>>>().toEqualTypeOf<'GONE'>();
  expectTypeOf<
    DefinedCodeOf<ErrorOf<ReturnType<typeof client.feed.query>>>
  >().toEqualTypeOf<'GONE'>();
  expectTypeOf<
    Extract<CodeOf<ErrorOf<Feed>>, LinkErrorCode>
  >().toEqualTypeOf<LinkErrorCode>();
  expectTypeOf<
    DefinedCodeOf<ErrorOf<Awaited<ReturnType<typeof client.checkout.mutate>>>>
  >().toEqualTypeOf<'SOLD_OUT'>();
  expectTypeOf<
    DefinedCodeOf<ErrorOf<Awaited<ReturnType<typeof client.validated.query>>>>
  >().toEqualTypeOf<'SOLD_OUT'>();
  // A generator's thrown errors are typed only when declared.
  type Generated = Awaited<ReturnType<typeof client.generator.query>>;
  expectTypeOf<DefinedCodeOf<ErrorOf<Generated>>>().toBeNever();
  expectTypeOf<
    Extract<CodeOf<ErrorOf<Generated>>, 'STREAM_INTERRUPTED'>
  >().toEqualTypeOf<'STREAM_INTERRUPTED'>();
  // An output that doesn't stream is as it was.
  expectTypeOf<Awaited<ReturnType<typeof client.plain.query>>>().toEqualTypeOf<{
    n: number;
  }>();

  const [feed, err] = await safe(client.feed.query());
  if (!err) {
    expectTypeOf(feed).toEqualTypeOf<
      TrpcIterable<number, any, ErrorOf<Feed>>
    >();
    for await (const [n, streamErr] of safe(feed)) {
      if (streamErr) {
        matchError(streamErr, {
          ...offline,
          GONE: (e) => expectTypeOf(e.data).toEqualTypeOf<{ at: number }>(),
        });
        // @ts-expect-error: GONE is the stream's, and needs its key
        matchError(streamErr, offline);
      } else {
        expectTypeOf(n).toEqualTypeOf<number>();
      }
    }
  }

  // A subscription is iterated the same way.
  for await (const [tick, tickErr] of safe(
    client.ticks.subscribe(undefined, { reconnect: false }),
  )) {
    if (tickErr) matchError(tickErr, { ...offline, GONE: () => 'gone' });
    else expectTypeOf(tick).toEqualTypeOf<number>();
  }

  // The safe client iterates safely on its own.
  const safeClient = createSafeClient(client);
  type CheckoutError = ErrorOf<ReturnType<typeof client.checkout.mutate>>;
  const [checkout, checkoutErr] = await safeClient.checkout.mutate();
  if (!checkoutErr) {
    expectTypeOf(checkout).toEqualTypeOf<
      AsyncIterable<SafeResult<'reserved', CheckoutError>>
    >();
    for await (const [item, streamErr] of checkout) {
      if (streamErr) {
        matchError(streamErr, {
          ...offline,
          SOLD_OUT: (e) =>
            expectTypeOf(e.data).toEqualTypeOf<{ sku: string }>(),
        });
        // @ts-expect-error: SOLD_OUT is the stream's, and needs its key
        matchError(streamErr, offline);
      } else {
        expectTypeOf(item).toEqualTypeOf<'reserved'>();
      }
    }
  }
  for await (const [tick, tickErr] of safeClient.ticks.subscribe(undefined, {
    reconnect: false,
  })) {
    if (tickErr) matchError(tickErr, { ...offline, GONE: () => 'gone' });
    else expectTypeOf(tick).toEqualTypeOf<number>();
  }
  expectTypeOf(safeClient.plain.query).returns.resolves.toEqualTypeOf<
    SafeResult<{ n: number }, ErrorOf<ReturnType<typeof client.plain.query>>>
  >();

  const effectClient = createEffectClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: 'http://localhost/trpc' })],
  });
  type EffectFeed = Effect.Success<ReturnType<typeof effectClient.feed.query>>;
  expectTypeOf<DefinedCodeOf<ErrorOf<EffectFeed>>>().toEqualTypeOf<'GONE'>();
  expectTypeOf<
    DefinedCodeOf<Effect.Error<ReturnType<typeof effectClient.feed.query>>>
  >().toEqualTypeOf<'GONE'>();
  expectTypeOf<
    Effect.Success<ReturnType<typeof effectClient.plain.query>>
  >().toEqualTypeOf<{ n: number }>();
});

test('a declared streamed output may fail only with what it declares, with or without an output schema', () => {
  t.procedure
    .errors(SoldOut)
    // @ts-expect-error: GONE isn't declared
    .query(() => Stream.fail(error({ code: 'GONE' })));
  t.procedure
    .output(stream(z.number()))
    .errors(SoldOut)
    // @ts-expect-error: nor here
    .query(() => Stream.fail(error({ code: 'GONE' })));
});

async function expectTypedFailures(links: AtLeastOneLink) {
  const client = createTrpcClient({ router: routerType<AppRouter>(), links });

  const [feed, feedErr] = await safe(client.feed.query());
  expect(feedErr).toBeUndefined();
  const fed = await steps(safe(feed!));
  expect(fed.items).toEqual([1, 2]);
  expect(fed.err).toMatchObject({
    code: 'GONE',
    data: { at: 2 },
    defined: true,
  });
  expect(
    matchError(fed.err!, { ...offline, GONE: (e) => `gone at ${e.data.at}` }),
  ).toBe('gone at 2');

  const safeClient = createSafeClient(client);
  const [checkout] = await safeClient.checkout.mutate();
  const checkedOut = await steps(checkout!);
  expect(checkedOut.items).toEqual(['reserved']);
  expect(checkedOut.err).toMatchObject({
    code: 'SOLD_OUT',
    data: { sku: 'a1' },
    defined: true,
  });
  const safeTicked = await steps(safeClient.ticks.subscribe());
  expect(safeTicked.items).toEqual([1]);
  expect(safeTicked.err).toMatchObject({ code: 'GONE', defined: true });

  const validated = await steps(safe(await client.validated.query()));
  expect(validated.err).toMatchObject({ code: 'SOLD_OUT', defined: true });

  const generated = await steps(safe(await client.generator.query()));
  expect(generated).toEqual({ items: [1], err: undefined });

  const ticked = await steps(safe(client.ticks.subscribe()));
  expect(ticked.items).toEqual([1]);
  expect(ticked.err).toMatchObject({ code: 'GONE', defined: true });
}

test("httpLink: a streamed output's typed failures arrive typed, through safe()", async () => {
  await using server = await createTestServer({ router });
  await expectTypedFailures([httpLink({ url: server.url })]);
});

test("wsLink: a streamed output's typed failures arrive typed, through safe()", async () => {
  await using server = await createTestServer({ router });
  await using ws = wsLink({ url: server.wsUrl });
  await expectTypedFailures([ws]);
});

test('safe() iterates without throwing, and closes the source when the loop is left', async () => {
  let closed = false;
  const caller = createRouterClient(
    t.router({
      ...router,
      endless: t.procedure.query(async function* () {
        try {
          for (let i = 0; ; i++) yield i;
        } finally {
          closed = true;
        }
      }),
    }),
    { ctx: {} },
  );
  const fed = await steps(safe(await caller.feed.query()));
  expect(fed.err).toMatchObject({ code: 'GONE', defined: true });

  for await (const [n] of safe(await caller.endless.query())) {
    if (n === 2) break;
  }
  expect(closed).toBe(true);

  const result = (await safe(await caller.generator.query())
    [Symbol.asyncIterator]()
    .next()) as IteratorResult<unknown>;
  expect(result.value).toEqual(
    Object.assign([1, undefined], { data: 1, error: undefined }),
  );

  // A framework's control-flow error still throws.
  const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
    digest: 'NEXT_REDIRECT;replace;/login;307;',
  });
  const redirecting: AsyncIterable<number> = {
    async *[Symbol.asyncIterator]() {
      yield 1;
      throw redirect;
    },
  };
  await expect(steps(safe(redirecting))).rejects.toBe(redirect);
});

test("createSafeClient iterates a streamed output without throwing, closes it when the loop is left, and keeps a ReadableStream's bytes", async () => {
  let closed = false;
  const safeClient = createSafeClient(
    createRouterClient(
      t.router({
        ...router,
        endless: t.procedure.query(async function* () {
          try {
            for (let i = 0; ; i++) yield i;
          } finally {
            closed = true;
          }
        }),
        bytes: t.procedure.query(
          () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
        ),
      }),
      { ctx: {} },
    ),
  );

  const [feed] = await safeClient.feed.query();
  const fed = await steps(feed!);
  expect(fed.items).toEqual([1, 2]);
  expect(fed.err).toMatchObject({ code: 'GONE', defined: true });

  const [endless] = await safeClient.endless.query();
  for await (const [n] of endless!) {
    if (n === 2) break;
  }
  expect(closed).toBe(true);

  const [bytes] = await safeClient.bytes.query();
  expectTypeOf(bytes).toEqualTypeOf<ReadableStream<Uint8Array> | undefined>();
  expect(bytes).toBeInstanceOf(ReadableStream);
});

test('an Effect client gets the typed failure from iterating a streamed output', async () => {
  await using server = await createTestServer({ router });
  const client = createEffectClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  const err = await Effect.runPromise(
    client.feed.query().pipe(
      Effect.flatMap((feed) =>
        Stream.runDrain(
          Stream.fromAsyncIterable(feed, (e) => e as ErrorOf<typeof feed>),
        ),
      ),
      Effect.flip,
    ),
  );
  expect(err).toMatchObject({ code: 'GONE', defined: true });
});
