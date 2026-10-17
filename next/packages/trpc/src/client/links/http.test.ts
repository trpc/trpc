import {
  createTrpcClient,
  httpLink,
  link,
  safe,
  splitLink,
  TrpcError,
  routerType,
  type BuiltinCallOptions,
} from '@trpc12/trpc/client';
import { error, initTrpc } from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { expect, expectTypeOf, test, vi } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let finished = 0;

const router = {
  double: t.procedure
    .input(z.object({ n: z.number() }))
    .query((opts) => opts.input.n * 2),
  fail: t.procedure.query(() => error({ code: 'NOT_FOUND', message: 'Nope' })),
  bump: t.procedure
    .input(z.object({ by: z.number() }))
    .mutation((opts) => ({ bumped: opts.input.by })),
  dashboard: t.procedure.query(() => ({
    title: 'Dashboard',
    stats: sleep(20).then(() => ({ visits: 42 })),
    feed: (async function* () {
      try {
        for (const item of ['a', 'b', 'c']) {
          await sleep(5);
          yield item;
        }
      } finally {
        finished++;
      }
    })(),
  })),
  flaky: t.procedure.query(() => ({
    ok: 1,
    later: sleep(5).then(() => {
      throw new Error('kaboom');
    }) as Promise<number>,
  })),
  ticks: t.procedure.mutation(async function* () {
    try {
      for (let n = 0; ; n++) {
        await sleep(5);
        yield n;
      }
    } finally {
      ticksStopped++;
    }
  }),
};
let ticksStopped = 0;
type AppRouter = typeof router;

async function setup(opts: { serverBatch?: boolean; clientBatch?: boolean }) {
  const server = await createTestServer({
    router,
    batch: opts.serverBatch ?? true,
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, batch: opts.clientBatch ?? true })],
  });
  return { server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('calls made in the same tick share one request', async () => {
  await using ctx = await setup({});
  const results = await Promise.all([
    ctx.client.double.query({ n: 1 }),
    ctx.client.double.query({ n: 2 }),
    ctx.client.double.query({ n: 3 }),
  ]);
  expect(results).toEqual([2, 4, 6]);
  expect(ctx.server.requests).toHaveLength(1);
  const [request] = ctx.server.requests;
  expect(request!.method).toBe('POST');
  expect(request!.headers.get('trpc-batch')).toBe('1');
});

test('each call in a batch settles on its own', async () => {
  await using ctx = await setup({});
  const [ok, failed] = await Promise.all([
    safe(ctx.client.double.query({ n: 21 })),
    safe(ctx.client.fail.query()),
  ]);
  expect(ok.data).toBe(42);
  expect(failed.error).toMatchObject({
    code: 'NOT_FOUND',
    defined: true,
  });
  expect(ctx.server.requests).toHaveLength(1);
});

test('queries and mutations are batched separately', async () => {
  await using ctx = await setup({});
  const [double, bump] = await Promise.all([
    ctx.client.double.query({ n: 5 }),
    ctx.client.bump.mutate({ by: 1 }),
  ]);
  expect(double).toBe(10);
  expect(bump).toEqual({ bumped: 1 });
  expect(ctx.server.requests).toHaveLength(2);
});

test('the client splits batches above maxItems', async () => {
  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, batch: { maxItems: 2 } })],
  });
  const results = await Promise.all(
    [1, 2, 3, 4, 5].map((n) => client.double.query({ n })),
  );
  expect(results).toEqual([2, 4, 6, 8, 10]);
  expect(server.requests).toHaveLength(3);
});

test('a server without batching rejects batched requests', async () => {
  await using ctx = await setup({ serverBatch: false });
  const [, err] = await safe(ctx.client.double.query({ n: 1 }));
  expect(err).toMatchObject({ code: 'BAD_REQUEST' });
});

test('nested promises and async iterables stream as JSONL', async () => {
  await using ctx = await setup({ clientBatch: false });
  const result = await ctx.client.dashboard.query();
  expect(result.title).toBe('Dashboard');
  expectTypeOf(result.stats).toEqualTypeOf<Promise<{ visits: number }>>();
  expectTypeOf(result.feed).toEqualTypeOf<AsyncIterable<string>>();
  expect(ctx.server.requests.at(-1)!.method).toBe('GET');

  const items: string[] = [];
  for await (const item of result.feed) items.push(item);
  expect(items).toEqual(['a', 'b', 'c']);
  expect(await result.stats).toEqual({ visits: 42 });
});

test('deferred values stream inside a batch too', async () => {
  await using ctx = await setup({});
  const [dashboard, double] = await Promise.all([
    ctx.client.dashboard.query(),
    ctx.client.double.query({ n: 4 }),
  ]);
  expect(double).toBe(8);
  expect(await dashboard.stats).toEqual({ visits: 42 });
  const items: string[] = [];
  for await (const item of dashboard.feed) items.push(item);
  expect(items).toEqual(['a', 'b', 'c']);
  expect(ctx.server.requests).toHaveLength(1);
});

test('a deferred value that fails rejects on the client', async () => {
  await using ctx = await setup({ clientBatch: false });
  const result = await ctx.client.flaky.query();
  expect(result.ok).toBe(1);
  await expect(result.later).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
  });
});

test('the server finishes the iterable once it is drained', async () => {
  await using ctx = await setup({ clientBatch: false });
  const before = finished;
  const result = await ctx.client.dashboard.query();
  for await (const _ of result.feed);
  await result.stats;
  expect(finished).toBe(before + 1);
});

test('aborting a streamed output rejects with CLIENT_CLOSED_REQUEST and stops the server generator', async () => {
  await using ctx = await setup({ clientBatch: false });
  const before = ticksStopped;
  const controller = new AbortController();
  const ticks = await ctx.client.ticks.mutate(undefined, {
    signal: controller.signal,
  });
  const seen: number[] = [];
  const [, err] = await safe(
    (async () => {
      for await (const n of ticks) {
        seen.push(n);
        if (n === 2) controller.abort();
      }
    })(),
  );
  expect(seen).toEqual([0, 1, 2]);
  expect(err).toMatchObject({ code: 'CLIENT_CLOSED_REQUEST' });
  await vi.waitFor(() => expect(ticksStopped).toBe(before + 1));
});

test('a stream that ends early rejects open values with STREAM_INTERRUPTED', async () => {
  await using server = await createTestServer({ router });
  const truncating: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    const lines = (await res.text()).split('\n').filter(Boolean);
    return new Response(`${lines[0]}\n`, {
      status: res.status,
      headers: res.headers,
    });
  };
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url, fetch: truncating })],
  });
  const out = await client.dashboard.query();
  const err = await out.stats.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(TrpcError);
  expect(err).toMatchObject({
    code: 'STREAM_INTERRUPTED',
    _tag: 'STREAM_INTERRUPTED',
  });
});

// --- responses -----------------------------------------------------------------

const versioned = {
  version: t.procedure.query((opts) => {
    opts.response.headers.set('x-version', '7');
    return 'v7';
  }),
  fail: router.fail,
  ticks: t.procedure.subscription(async function* () {
    yield 1;
  }),
};

/**
 * Needs `'response'`: records each call's response before its value, then
 * hands it on to the caller's own `onResponse`.
 */
const responsesLink = (seen: Array<{ path: string; status: number }>) =>
  link<{ needs: 'response' }>((opts) =>
    opts.next({
      ...opts.op,
      context: {
        ...opts.op.context,
        onResponse: (meta) => {
          seen.push({ path: opts.op.path, status: meta.status });
          opts.op.context.onResponse?.(meta);
        },
      },
    }),
  );

test('a link before httpLink reads each response through onResponse', async () => {
  await using server = await createTestServer({ router: versioned });
  const seen: Array<{ path: string; status: number }> = [];
  let version: string | null = null;
  const client = createTrpcClient({
    router: routerType<typeof versioned>(),
    links: [responsesLink(seen), httpLink({ url: server.url })],
  });
  expect(
    await client.version.query(undefined, {
      onResponse: (opts) => (version = opts.headers.get('x-version')),
    }),
  ).toBe('v7');
  expect(version).toBe('7');
  for await (const tick of client.ticks.subscribe()) expect(tick).toBe(1);
  expect(seen).toEqual([
    { path: 'version', status: 200 },
    { path: 'ticks', status: 200 },
  ]);
});

test('each call in a batch gets its own line status with the batch headers', async () => {
  await using server = await createTestServer({
    router: versioned,
    batch: true,
  });
  const seen: Array<{ path: string; status: number }> = [];
  const client = createTrpcClient({
    router: routerType<typeof versioned>(),
    links: [responsesLink(seen), httpLink({ url: server.url, batch: true })],
  });
  const headers: Headers[] = [];
  const onResponse = (meta: { headers: Headers }) => headers.push(meta.headers);
  await Promise.all([
    safe(client.version.query(undefined, { onResponse })),
    safe(client.fail.query(undefined, { onResponse })),
  ]);
  expect(headers).toHaveLength(2);
  expect(headers[0]).toBe(headers[1]);
  expect(seen).toEqual([
    { path: 'version', status: 200 },
    { path: 'fail', status: 404 },
  ]);
  expect(server.requests).toHaveLength(1);

  await using unbatched = await createTestServer({
    router: versioned,
    batch: false,
  });
  seen.length = 0;
  const rejected = createTrpcClient({
    router: routerType<typeof versioned>(),
    links: [responsesLink(seen), httpLink({ url: unbatched.url, batch: true })],
  });
  const [, err] = await safe(rejected.version.query());
  expect(err).toMatchObject({ code: 'BAD_REQUEST' });
  expect(seen).toEqual([{ path: 'version', status: 400 }]);
});

test('an onResponse that throws fails its call with CLIENT_ERROR', async () => {
  await using server = await createTestServer({
    router: versioned,
    batch: true,
  });
  const throwing: BuiltinCallOptions = {
    onResponse: () => {
      throw new Error('no thanks');
    },
  };
  const failure = { code: 'CLIENT_ERROR', message: 'no thanks' };
  for (const batch of [false, true]) {
    const client = createTrpcClient({
      router: routerType<typeof versioned>(),
      links: [httpLink({ url: server.url, batch })],
    });
    const [ok, thrown] = await Promise.all([
      safe(client.version.query()),
      safe(client.version.query(undefined, throwing)),
    ]);
    expect(ok.data).toBe('v7');
    expect(thrown.error).toMatchObject(failure);
  }
  const client = createTrpcClient({
    router: routerType<typeof versioned>(),
    links: [httpLink({ url: server.url, batch: true })],
  });
  await using unbatched = await createTestServer({
    router: versioned,
    batch: false,
  });
  const rejected = createTrpcClient({
    router: routerType<typeof versioned>(),
    links: [httpLink({ url: unbatched.url, batch: true })],
  });
  const [, rejectedErr] = await safe(
    rejected.version.query(undefined, throwing),
  );
  expect(rejectedErr).toMatchObject(failure);
  await expect(
    (async () => {
      for await (const _ of client.ticks.subscribe(undefined, throwing));
    })(),
  ).rejects.toMatchObject(failure);
});

test('a link that needs the response must have a provider after it', () => {
  const url = 'http://localhost';
  const seen: Array<{ path: string; status: number }> = [];
  const http = httpLink({ url });
  const silent = link((opts) => opts.next(opts.op));
  createTrpcClient({
    router: routerType<typeof versioned>(),
    links: [responsesLink(seen), silent, http],
  });
  createTrpcClient({
    router: routerType<typeof versioned>(),
    // @ts-expect-error -- httpLink comes first, so it can't report to it
    links: [http, responsesLink(seen)],
  });
  createTrpcClient({
    router: routerType<typeof versioned>(),
    links: [
      responsesLink(seen),
      splitLink({ condition: () => true, true: http, false: [silent, http] }),
    ],
  });
  createTrpcClient({
    router: routerType<typeof versioned>(),
    // @ts-expect-error -- only one branch reports responses
    links: [
      responsesLink(seen),
      splitLink({ condition: () => true, true: http, false: silent }),
    ],
  });
});
