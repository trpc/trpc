import { Effect, Schema, Stream } from 'effect';
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  link,
  routerType,
  safe,
  splitLink,
  switchLink,
  TrpcError,
  type Operation,
} from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { initTrpc } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = { calls: 0, aborted: 0 };

const router = {
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async (opts) => {
        state.calls++;
        await sleep(20);
        if (opts.signal.aborted) state.aborted++;
        return { id: opts.input.id, call: state.calls };
      }),
    create: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation(({ input }) => ({ id: '9', ...input })),
    /** Answers when the server sees the request abort. */
    untilAborted: t.procedure
      .input(z.object({ id: z.string() }))
      .query((opts) => {
        state.calls++;
        return new Promise<{ id: string }>((resolve) => {
          opts.signal.addEventListener('abort', () => {
            state.aborted++;
            resolve({ id: opts.input.id });
          });
        });
      }),
  },
};
type AppRouter = typeof router;
const otherRouter = { other: t.procedure.query(() => 1) };

async function setup() {
  const server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [dedupeLink(), httpLink({ url: server.url })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('dedupeLink shares identical queries in flight', async () => {
  await using ctx = await setup();
  const [a, b, c] = await Promise.all([
    ctx.client.post.byId.query({ id: '1' }),
    ctx.client.post.byId.query({ id: '1' }),
    ctx.client.post.byId.query({ id: '2' }),
  ]);
  expect(a).toBe(b);
  expect(c.id).toBe('2');
  expect(ctx.server.requests).toHaveLength(2);

  await Promise.all([
    ctx.client.post.byId.query({ id: '1' }),
    ctx.client.post.byId.query({ id: '1' }, { dedupe: false }),
  ]);
  expect(ctx.server.requests).toHaveLength(4);

  await Promise.all([
    ctx.client.post.create.mutate({ title: 'x' }),
    ctx.client.post.create.mutate({ title: 'x' }),
  ]);
  expect(ctx.server.requests).toHaveLength(6);
});

test('a shared query is aborted only when every caller aborts', async () => {
  await using ctx = await setup();
  const first = new AbortController();
  const second = new AbortController();
  const before = state.aborted;
  const a = ctx.client.post.byId.query({ id: '3' }, { signal: first.signal });
  const b = ctx.client.post.byId.query({ id: '3' }, { signal: second.signal });
  first.abort();
  await expect(a).rejects.toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  expect((await b).id).toBe('3');
  expect(state.aborted).toBe(before);

  const c = new AbortController();
  const d = new AbortController();
  const calls = state.calls;
  const both = [
    ctx.client.post.untilAborted.query({ id: '4' }, { signal: c.signal }),
    ctx.client.post.untilAborted.query({ id: '4' }, { signal: d.signal }),
  ];
  await vi.waitFor(() => expect(state.calls).toBe(calls + 1));
  c.abort();
  d.abort();
  await Promise.allSettled(both);
  await vi.waitFor(() => expect(state.aborted).toBe(before + 1));
});

test('links declare the call option fields calls may pass (17 D-C, F-B)', async () => {
  await using server = await createTestServer({ router });
  const seen: (string | undefined)[] = [];
  const traceLink = link<{ context: { traceId?: string } }>((opts) => {
    const { op } = opts;
    expectTypeOf(op.context.traceId).toEqualTypeOf<string | undefined>();
    seen.push(op.context.traceId);
    return opts.next(op);
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [traceLink, dedupeLink(), httpLink({ url: server.url })],
  });
  await client.post.byId.query(
    { id: '1' },
    { traceId: 'abc', dedupe: false, headers: { 'x-a': '1' } },
  );
  expect(seen).toEqual(['abc']);
  expect(server.requests.at(-1)!.headers.get('x-a')).toBe('1');

  void (() => {
    // @ts-expect-error -- no link declares `cache`
    void client.post.byId.query({ id: '1' }, { cache: false });
  });
});

test('splitLink sees typed paths, and merges both branches', async () => {
  await using server = await createTestServer({ router, batch: true });
  const conditions: string[] = [];
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => {
          expectTypeOf(op.path).toEqualTypeOf<
            'post.byId' | 'post.create' | 'post.untilAborted'
          >();
          conditions.push(op.path);
          return op.path === 'post.byId';
        },
        true: [dedupeLink(), httpLink({ url: server.url })],
        false: httpLink({ url: server.url, batch: true }),
      }),
    ],
  });
  await client.post.byId.query({ id: '1' }, { dedupe: true });
  await client.post.create.mutate({ title: 'x' });
  expect(conditions).toEqual(['post.byId', 'post.create']);
  expect(server.requests.at(-1)!.headers.get('trpc-batch')).toBe('1');

  splitLink<AppRouter>({
    // @ts-expect-error -- not a path of the router
    condition: (op) => op.path === 'post.nope',
    true: httpLink({ url: server.url }),
    false: httpLink({ url: server.url }),
  });

  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      // @ts-expect-error -- typed for another router
      splitLink<typeof otherRouter>({
        condition: () => true,
        true: httpLink({ url: server.url }),
        false: httpLink({ url: server.url }),
      }),
    ],
  });
});

test('routerType works for the Effect client too', async () => {
  await using server = await createTestServer({ router });
  const client = createEffectClient({
    router: routerType<AppRouter>(),
    links: [dedupeLink(), httpLink({ url: server.url })],
  });
  const post = await Effect.runPromise(
    client.post.byId.query({ id: '5' }, { dedupe: false }),
  );
  expect(post.id).toBe('5');
  expectTypeOf(post).toEqualTypeOf<{ id: string; call: number }>();
});

test('custom links get an Operation typed with their declared context', () => {
  const declared = link<{ context: { tenant?: string } }>((opts) => {
    const { op } = opts;
    expectTypeOf(op).toExtend<Operation>();
    expectTypeOf(op.context.tenant).toEqualTypeOf<string | undefined>();
    return opts.next(op);
  });
  expectTypeOf(declared).not.toBeAny();

  // @ts-expect-error -- the client reads `signal` itself
  link<{ context: { signal?: string } }>((opts) => opts.next(opts.op));
  // @ts-expect-error -- the client reads `lastEventId` itself
  link<{ context: { lastEventId: number } }>((opts) => opts.next(opts.op));
});

test('switchLink picks a branch, and a typed call option forces one', async () => {
  await using server = await createTestServer({ router, batch: true });
  const picked: string[] = [];
  const tag = (name: string) =>
    link((opts) => {
      picked.push(name);
      return opts.next(opts.op);
    });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      switchLink({
        name: 'transport',
        links: {
          batched: [tag('batched'), httpLink({ url: server.url, batch: true })],
          single: [tag('single'), dedupeLink(), httpLink({ url: server.url })],
        },
        pick: (op) => {
          expectTypeOf(op.path).toEqualTypeOf<
            'post.byId' | 'post.create' | 'post.untilAborted'
          >();
          return op.type === 'mutation' ? 'single' : 'batched';
        },
      }),
    ],
  });
  await client.post.byId.query({ id: '1' });
  await client.post.byId.query(
    { id: '1' },
    { transport: 'single', dedupe: false },
  );
  await client.post.create.mutate({ title: 'x' });
  await client.post.create.mutate({ title: 'x' }, { transport: 'batched' });
  expect(picked).toEqual(['batched', 'single', 'single', 'batched']);
  expect(server.requests.at(-1)!.headers.get('trpc-batch')).toBe('1');

  void (() => {
    // @ts-expect-error -- not a branch
    void client.post.byId.query({ id: '1' }, { transport: 'ws' });
  });
});

test('switchLink names are checked', () => {
  const http = httpLink({ url: 'http://localhost' });
  expect(() =>
    switchLink({
      // @ts-expect-error -- the client reads `signal` itself
      name: 'signal',
      links: { http },
      pick: () => 'http',
    }),
  ).toThrow('reserved');
  expect(() =>
    switchLink({
      // @ts-expect-error -- httpLink reads `headers`
      name: 'headers',
      links: { http },
      pick: () => 'http',
    }),
  ).toThrow('reserved');
  const name: string = 'transport';
  // @ts-expect-error -- not a literal, so calls couldn't name it
  switchLink({ name, links: { http }, pick: () => 'http' });

  const inner = switchLink({
    name: 'region',
    links: { us: http, eu: http },
    pick: () => 'us',
  });
  expect(() =>
    switchLink({
      // @ts-expect-error -- already used inside a branch
      name: 'region',
      links: { a: inner, b: http },
      pick: () => 'a',
    }),
  ).toThrow('Two switchLinks on one chain are named "region"');
  const outer = switchLink({
    name: 'transport',
    links: { a: inner, b: http },
    pick: () => 'a',
  });
  expect(() =>
    createTrpcClient({
      router: routerType<AppRouter>(),
      // @ts-expect-error -- two switchLinks named `region` on one chain
      links: [
        outer,
        switchLink({ name: 'region', links: { x: http }, pick: () => 'x' }),
      ],
    }),
  ).toThrow('Two switchLinks on one chain are named "region"');
});

class RateLimited extends TrpcError.Tagged('RATE_LIMITED', {
  status: 429,
  data: Schema.Struct({ retryAfter: Schema.Number }),
}) {}

test("a link's own declared errors join every call's typed union", async () => {
  await using server = await createTestServer({ router });
  let allowed = 1;
  const rateLimit = link<{ errors: RateLimited }>((opts) =>
    allowed-- > 0
      ? opts.next(opts.op)
      : Stream.fail(new RateLimited({ retryAfter: 5 })),
  );
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [rateLimit, httpLink({ url: server.url })],
  });
  expect((await client.post.byId.query({ id: '1' })).id).toBe('1');
  const [, err] = await safe(client.post.create.mutate({ title: 'x' }));
  expect(err).toMatchObject({ code: 'RATE_LIMITED', defined: true });
  if (err?.defined && err.code === 'RATE_LIMITED') {
    expectTypeOf(err.data).toEqualTypeOf<{ readonly retryAfter: number }>();
    expect(err.data.retryAfter).toBe(5);
  }

  const effectClient = createEffectClient({
    router: routerType<AppRouter>(),
    links: [rateLimit, httpLink({ url: server.url })],
  });
  const retryAfter = await Effect.runPromise(
    effectClient.post.byId.query({ id: '1' }).pipe(
      Effect.map(() => 0),
      Effect.catchIf(
        (e) => e.defined && e.code === 'RATE_LIMITED',
        (e) => Effect.succeed(e.data.retryAfter),
      ),
    ),
  );
  expect(retryAfter).toBe(5);
});

const liveRouter = {
  latest: t.procedure.query(() => 1),
  feed: t.procedure.subscription(async function* () {
    yield 1;
  }),
};

test('methods a chain cannot carry are missing from the client', () => {
  const http = httpLink({ url: 'http://localhost' });
  const queriesOnly = link<{ unsupported: 'subscription' }>((opts) =>
    opts.next(opts.op),
  );
  const limited = createTrpcClient({
    router: routerType<typeof liveRouter>(),
    links: [queriesOnly, http],
  });
  expectTypeOf(limited.latest).toHaveProperty('query');
  expectTypeOf(limited.feed).not.toHaveProperty('subscribe');

  const split = createTrpcClient({
    router: routerType<typeof liveRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: http,
        false: [queriesOnly, http],
      }),
    ],
  });
  expectTypeOf(split.feed).toHaveProperty('subscribe');

  const neither = createTrpcClient({
    router: routerType<typeof liveRouter>(),
    links: [
      switchLink({
        name: 'via',
        links: { a: [queriesOnly, http], b: queriesOnly },
        pick: () => 'a',
      }),
    ],
  });
  expectTypeOf(neither.feed).not.toHaveProperty('subscribe');
  expectTypeOf(neither.latest).toHaveProperty('query');

  const effectClient = createEffectClient({
    router: routerType<typeof liveRouter>(),
    links: [queriesOnly, http],
  });
  expectTypeOf(effectClient.feed).not.toHaveProperty('subscribe');
});
