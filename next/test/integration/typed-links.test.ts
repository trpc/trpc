import { Effect } from 'effect';
import {
  createTrpcClient,
  dedupeLink,
  httpLink,
  link,
  routerType,
  splitLink,
  type Operation,
} from 'trpcdev/client';
import { createEffectClient } from 'trpcdev/effect';
import { initTrpc } from 'trpcdev/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const state = { calls: 0, aborted: 0 };

const router = {
  post: {
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(async ({ input, signal }) => {
        state.calls++;
        await sleep(20);
        if (signal.aborted) state.aborted++;
        return { id: input.id, call: state.calls };
      }),
    create: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation(({ input }) => ({ id: '9', ...input })),
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
  const both = [
    ctx.client.post.byId.query({ id: '4' }, { signal: c.signal }),
    ctx.client.post.byId.query({ id: '4' }, { signal: d.signal }),
  ];
  await sleep(5);
  c.abort();
  d.abort();
  await Promise.allSettled(both);
  await vi.waitFor(() => expect(state.aborted).toBe(before + 1));
});

test('links declare the call option fields calls may pass (17 D-C, F-B)', async () => {
  await using server = await createTestServer({ router });
  const seen: (string | undefined)[] = [];
  const traceLink = link<{ context: { traceId?: string } }>(
    async ({ op, next }) => {
      expectTypeOf(op.context.traceId).toEqualTypeOf<string | undefined>();
      seen.push(op.context.traceId);
      return next(op);
    },
  );
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

  const plain = createTrpcClient<AppRouter>({
    links: [traceLink, httpLink({ url: server.url })],
  });
  void (() => {
    // @ts-expect-error -- no link declares `cache`
    void client.post.byId.query({ id: '1' }, { cache: false });
    // @ts-expect-error -- the explicit-generic form does not infer link fields
    void plain.post.byId.query({ id: '1' }, { traceId: 'abc' });
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
          expectTypeOf(op.path).toEqualTypeOf<'post.byId' | 'post.create'>();
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
    // @ts-expect-error -- the splitLink below is typed for another router
    router: routerType<AppRouter>(),
    links: [
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
  const declared = link.effect<{ context: { tenant?: string } }>(
    ({ op, next }) => {
      expectTypeOf(op).toExtend<Operation>();
      expectTypeOf(op.context.tenant).toEqualTypeOf<string | undefined>();
      return next(op);
    },
  );
  expectTypeOf(declared).not.toBeAny();

  // @ts-expect-error -- the client reads `signal` itself
  link<{ context: { signal?: string } }>(({ op, next }) => next(op));
  // @ts-expect-error -- the client reads `lastEventId` itself
  link.effect<{ context: { lastEventId: number } }>(({ op, next }) => next(op));
});
