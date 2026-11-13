import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  getUntypedClient,
  httpBatchLink,
  httpBatchStreamLink,
} from '@trpc/client';
import { experimental_dedupeQueries, initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { z } from 'zod';

interface Context {
  user: string;
}

const createRouter = (opts: {
  transformer: 'none' | 'superjson';
  /** `null` for a router without the middleware */
  dedupeQueries: Parameters<typeof experimental_dedupeQueries>[0] | null;
}) => {
  const t =
    opts.transformer === 'superjson'
      ? initTRPC.context<Context>().create({ transformer: superjson })
      : initTRPC.context<Context>().create();
  /** Every run of a procedure */
  const runs = vi.fn();
  const procedure = opts.dedupeQueries
    ? t.procedure.use(experimental_dedupeQueries(opts.dedupeQueries))
    : t.procedure;
  const appRouter = t.router({
    author: procedure
      .input(z.object({ id: z.string(), since: z.date().optional() }))
      .query((call) => {
        // The middleware leaves the context's type as it was
        expectTypeOf(call.ctx).toEqualTypeOf<Context>();
        runs('author', call.input);
        if (call.input.id === 'missing') {
          throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return { id: call.input.id, run: runs.mock.calls.length };
      }),
    now: procedure.query(() => {
      runs('now');
      return runs.mock.calls.length;
    }),
    sizeOf: procedure.input(z.map(z.string(), z.number())).query((call) => {
      runs('sizeOf', call.input);
      return call.input.size;
    }),
    countTo: procedure.input(z.number()).query(async function* (call) {
      runs('countTo', call.input);
      for (let i = 1; i <= call.input; i++) {
        yield i;
      }
    }),
    rename: procedure.input(z.object({ id: z.string() })).mutation((call) => {
      runs('rename', call.input);
      return call.input.id;
    }),
    // After a middleware that gives every call a context of its own
    authorAfterAuth: t.procedure
      .use((call) => call.next({ ctx: { role: 'admin' } }))
      .use(experimental_dedupeQueries())
      .input(z.object({ id: z.string() }))
      .query((call) => {
        runs('authorAfterAuth', call.input);
        return call.input.id;
      }),
  });
  return { appRouter, runs };
};

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink, transformer: 'none' },
  { name: 'httpBatchLink', link: httpBatchLink, transformer: 'superjson' },
  {
    name: 'httpBatchStreamLink',
    link: httpBatchStreamLink,
    transformer: 'none',
  },
  {
    name: 'httpBatchStreamLink',
    link: httpBatchStreamLink,
    transformer: 'superjson',
  },
] as const)('$name with $transformer transformer', (scenario) => {
  function setup(opts: {
    dedupeQueries: Parameters<typeof experimental_dedupeQueries>[0] | null;
  }) {
    const { appRouter, runs } = createRouter({
      transformer: scenario.transformer,
      dedupeQueries: opts.dedupeQueries,
    });
    const onError = vi.fn();
    const ctx = testServerAndClientResource(appRouter, {
      server: { createContext: () => ({ user: 'KATT' }), onError },
      client: (clientOpts) => ({
        links: [
          scenario.link({
            url: clientOpts.httpUrl,
            transformer: clientOpts.transformer as any,
          }),
        ],
      }),
    });
    return Object.assign(ctx, {
      runs,
      onError,
      untyped: getUntypedClient(ctx.client),
    });
  }

  test('queries with the same path and input in one request run once', async () => {
    await using ctx = setup({ dedupeQueries: {} });

    const results = await Promise.all([
      ctx.client.author.query({ id: 'u1' }),
      ctx.client.author.query({ id: 'u2' }),
      ctx.client.author.query({ id: 'u1' }),
      ctx.client.now.query(),
      ctx.client.now.query(),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.runs.mock.calls).toHaveLength(3);
    expect(ctx.runs.mock.calls).toEqual(
      expect.arrayContaining([
        ['author', { id: 'u1' }],
        ['author', { id: 'u2' }],
        ['now'],
      ]),
    );
    // Every call has its own result, with the data of the one run
    const [first, other, again, now, nowAgain] = results;
    expect(again).toEqual(first);
    expect(other.run).not.toBe(first.run);
    expect(nowAgain).toBe(now);
  });

  test('without the middleware, every call runs', async () => {
    await using ctx = setup({ dedupeQueries: null });

    const results = await Promise.all([
      ctx.client.author.query({ id: 'u1' }),
      ctx.client.author.query({ id: 'u1' }),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.runs).toHaveBeenCalledTimes(2);
    expect(results.map((result) => result.run).sort()).toEqual([1, 2]);
  });

  test('inputs are compared as JSON, whatever the order of their keys', async () => {
    await using ctx = setup({ dedupeQueries: {} });
    const since = new Date('2026-01-01T00:00:00Z');
    const dates = scenario.transformer === 'superjson';

    await Promise.all([
      ctx.client.author.query({ id: 'u1', ...(dates ? { since } : {}) }),
      ctx.client.author.query({
        ...(dates ? { since: new Date(since) } : {}),
        id: 'u1',
      }),
      // Another input
      ctx.client.author.query(
        dates ? { id: 'u1', since: new Date(0) } : { id: 'u3' },
      ),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.runs).toHaveBeenCalledTimes(2);
  });

  test('`inputHashFn` decides which inputs are the same', async () => {
    const inputHashFn = vi.fn((call: { path: string; input: unknown }) =>
      // Authors by their id, whatever else the input has
      call.path === 'author' ? (call.input as { id: string }).id : null,
    );
    await using ctx = setup({ dedupeQueries: { inputHashFn } });
    const dates = scenario.transformer === 'superjson';

    const results = await Promise.all([
      ctx.client.author.query({ id: 'u1' }),
      ctx.client.author.query(
        dates ? { id: 'u1', since: new Date(0) } : { id: 'u1' },
      ),
      ctx.client.author.query({ id: 'u2' }),
      // `null`: these run for themselves
      ctx.client.now.query(),
      ctx.client.now.query(),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.runs.mock.calls.map(([path]) => path).sort()).toEqual([
      'author',
      'author',
      'now',
      'now',
    ]);
    expect(results[1]).toEqual(results[0]);
    expect(results[4]).not.toBe(results[3]);
    // It gets the input before it is validated, with its dates
    expect(inputHashFn).toHaveBeenCalledWith({
      path: 'author',
      input: dates ? { id: 'u1', since: new Date(0) } : { id: 'u1' },
    });
    expect(inputHashFn).toHaveBeenCalledWith({ path: 'now', input: undefined });
  });

  test('an `inputHashFn` that throws fails the call', async () => {
    await using ctx = setup({
      dedupeQueries: {
        inputHashFn: (call) => {
          if (call.path === 'now') {
            throw new Error('No hash');
          }
          return '';
        },
      },
    });

    const results = await Promise.allSettled([
      ctx.client.now.query(),
      ctx.client.author.query({ id: 'u1' }),
    ]);

    expect(results).toMatchObject([
      {
        status: 'rejected',
        reason: { message: 'No hash', data: { code: 'INTERNAL_SERVER_ERROR' } },
      },
      { status: 'fulfilled', value: { id: 'u1' } },
    ]);
    expect(ctx.runs.mock.calls).toEqual([['author', { id: 'u1' }]]);
    expect(ctx.onError).toHaveBeenCalledTimes(1);
  });

  test('a later request runs the query again', async () => {
    await using ctx = setup({ dedupeQueries: {} });

    await ctx.client.author.query({ id: 'u1' });
    await ctx.client.author.query({ id: 'u1' });

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(2);
    expect(ctx.runs).toHaveBeenCalledTimes(2);
  });

  test('mutations run once per call', async () => {
    await using ctx = setup({ dedupeQueries: {} });

    await Promise.all([
      ctx.client.rename.mutate({ id: 'u1' }),
      ctx.client.rename.mutate({ id: 'u1' }),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.runs).toHaveBeenCalledTimes(2);
  });

  test('a failed run fails every call that has its input, and is reported for each', async () => {
    await using ctx = setup({ dedupeQueries: {} });

    const results = await Promise.allSettled([
      ctx.client.author.query({ id: 'missing' }),
      ctx.client.author.query({ id: 'missing' }),
      ctx.client.author.query({ id: 'u1' }),
    ]);

    expect(results).toMatchObject([
      { status: 'rejected', reason: { data: { code: 'NOT_FOUND' } } },
      { status: 'rejected', reason: { data: { code: 'NOT_FOUND' } } },
      { status: 'fulfilled', value: { id: 'u1' } },
    ]);
    expect(ctx.runs).toHaveBeenCalledTimes(2);
    expect(ctx.onError).toHaveBeenCalledTimes(2);
  });

  test('an input that fails validation fails every call that has it', async () => {
    await using ctx = setup({ dedupeQueries: {} });

    const results = await Promise.allSettled([
      ctx.untyped.query('author', { id: 1 }),
      ctx.untyped.query('author', { id: 1 }),
    ]);

    expect(results).toMatchObject([
      { status: 'rejected', reason: { data: { code: 'BAD_REQUEST' } } },
      { status: 'rejected', reason: { data: { code: 'BAD_REQUEST' } } },
    ]);
    expect(ctx.runs).not.toHaveBeenCalled();
  });

  test('after a middleware that changes the context, every call runs', async () => {
    await using ctx = setup({ dedupeQueries: {} });

    await Promise.all([
      ctx.client.authorAfterAuth.query({ id: 'u1' }),
      ctx.client.authorAfterAuth.query({ id: 'u1' }),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.runs).toHaveBeenCalledTimes(2);
  });
});

test('an input that JSON cannot carry runs for itself', async () => {
  const { appRouter, runs } = createRouter({
    transformer: 'superjson',
    dedupeQueries: {},
  });
  await using ctx = testServerAndClientResource(appRouter, {
    server: { createContext: () => ({ user: 'KATT' }) },
  });

  // As JSON, both maps are `{}`
  const results = await Promise.all([
    ctx.client.sizeOf.query(new Map([['a', 1]])),
    ctx.client.sizeOf.query(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    ),
  ]);

  expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  expect(results).toEqual([1, 2]);
  expect(runs).toHaveBeenCalledTimes(2);
});

test('a query that streams runs for every call, which each get the whole stream', async () => {
  const { appRouter, runs } = createRouter({
    transformer: 'none',
    dedupeQueries: {},
  });
  await using ctx = testServerAndClientResource(appRouter, {
    server: { createContext: () => ({ user: 'KATT' }) },
    client: (clientOpts) => ({
      links: [httpBatchStreamLink({ url: clientOpts.httpUrl })],
    }),
  });

  const read = async (stream: AsyncIterable<number>) => {
    const values = [];
    for await (const value of stream) {
      values.push(value);
    }
    return values;
  };
  const results = await Promise.all([
    ctx.client.countTo.query(3).then(read),
    ctx.client.countTo.query(3).then(read),
  ]);

  expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  expect(results).toEqual([
    [1, 2, 3],
    [1, 2, 3],
  ]);
  expect(runs).toHaveBeenCalledTimes(2);
});

test('a context that outlives a request shares only the calls in flight', async () => {
  const t = initTRPC.context<Context>().create();
  const runs = vi.fn();
  const appRouter = t.router({
    author: t.procedure
      .use(experimental_dedupeQueries())
      .input(z.object({ id: z.string() }))
      .query((call) => {
        runs(call.input);
        return { id: call.input.id, run: runs.mock.calls.length };
      }),
  });
  // As a WebSocket connection has: one context for every call
  const caller = t.createCallerFactory(appRouter)({ user: 'KATT' });

  const together = await Promise.all([
    caller.author({ id: 'u1' }),
    caller.author({ id: 'u1' }),
  ]);
  expect(together[1]).toEqual(together[0]);
  expect(runs).toHaveBeenCalledTimes(1);

  // Not a cache: the next call runs again
  const later = await caller.author({ id: 'u1' });
  expect(later.run).toBe(2);
  expect(runs).toHaveBeenCalledTimes(2);
});
