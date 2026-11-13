import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  getUntypedClient,
  httpBatchLink,
  httpBatchStreamLink,
} from '@trpc/client';
import { initTRPC, TRPCError, unstable_dedupeQueries } from '@trpc/server';
import { createBuilder } from '@trpc/server/unstable-core-do-not-import';
import superjson from 'superjson';
import { z } from 'zod';

interface Context {
  user: string;
}

/** Resolves after the procedure has returned */
const later = <TValue>(value: () => TValue) =>
  new Promise<TValue>((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(value());
      } catch (cause) {
        reject(cause);
      }
    });
  });

async function* streamOf<TValue>(...values: TValue[]) {
  yield* values;
}

async function readAll<TValue>(stream: AsyncIterable<TValue>) {
  const values = [];
  for await (const value of stream) {
    values.push(value);
  }
  return values;
}

/** Stops reading a stream, as leaving a `for await` does */
const stop = (stream: AsyncIterator<unknown>) => stream.return?.();

/** What a stream yields before it fails, and what it fails with */
async function readUntilError<TValue>(stream: AsyncIterable<TValue>) {
  const values = [];
  try {
    for await (const value of stream) {
      values.push(value);
    }
  } catch (error) {
    return { values, error };
  }
  return { values, error: null };
}

type InputHashFn = NonNullable<
  NonNullable<Parameters<typeof unstable_dedupeQueries>[0]>['inputHashFn']
>;

const createRouter = (opts: {
  transformer: 'none' | 'superjson';
  /** `null` for a router without the middleware */
  dedupeQueries: Parameters<typeof unstable_dedupeQueries>[0] | null;
}) => {
  const t =
    opts.transformer === 'superjson'
      ? initTRPC.context<Context>().create({ transformer: superjson })
      : initTRPC.context<Context>().create();
  /** Every run of a procedure */
  const runs = vi.fn();
  const procedure = opts.dedupeQueries
    ? t.procedure.use(unstable_dedupeQueries(opts.dedupeQueries))
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
      // A stream runs when it is first read
      runs('countTo', call.input);
      for (let i = 1; i <= call.input; i++) {
        yield i;
      }
    }),
    failAfter: procedure.input(z.number()).query(async function* (call) {
      runs('failAfter', call.input);
      for (let i = 1; i <= call.input; i++) {
        yield i;
      }
      throw new TRPCError({ code: 'NOT_FOUND' });
    }),
    profile: procedure.input(z.object({ id: z.string() })).query((call) => {
      runs('profile', call.input);
      return {
        id: call.input.id,
        run: runs.mock.calls.length,
        posts: later(() => {
          if (call.input.id === 'missing') {
            throw new TRPCError({ code: 'NOT_FOUND' });
          }
          return [`${call.input.id}'s first post`];
        }),
      };
    }),
    // Streams in what a stream yields and in what a promise resolves to
    feed: procedure.query(async function* () {
      runs('feed');
      yield {
        name: 'a',
        items: streamOf(1, 2),
        more: later(() => ({ total: 2, items: streamOf(3, 4) })),
      };
      yield {
        name: 'b',
        items: streamOf(5),
        more: later(() => ({ total: 1, items: streamOf(6) })),
      };
    }),
    rename: procedure.input(z.object({ id: z.string() })).mutation((call) => {
      runs('rename', call.input);
      return call.input.id;
    }),
    // After a middleware that gives every call a context of its own
    authorAfterAuth: t.procedure
      .use((call) => call.next({ ctx: { role: 'admin' } }))
      .use(unstable_dedupeQueries())
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
    dedupeQueries: Parameters<typeof unstable_dedupeQueries>[0] | null;
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
      transformer: expect.anything(),
      path: 'author',
      input: dates ? { id: 'u1', since: new Date(0) } : { id: 'u1' },
    });
    expect(inputHashFn).toHaveBeenCalledWith({
      transformer: expect.anything(),
      path: 'now',
      input: undefined,
    });
  });

  test('`inputHashFn` gets the transformer, to encode an input as the client sends it', async () => {
    const inputHashFn = vi.fn(
      (call: Parameters<InputHashFn>[0]) =>
        JSON.stringify(call.transformer.input.serialize(call.input)) ?? '',
    );
    await using ctx = setup({ dedupeQueries: { inputHashFn } });
    const dates = scenario.transformer === 'superjson';

    await Promise.all([
      ctx.client.author.query(
        dates ? { id: 'u1', since: new Date(0) } : { id: 'u1' },
      ),
      ctx.client.author.query(
        dates ? { id: 'u1', since: new Date(0) } : { id: 'u1' },
      ),
      // Another input
      ctx.client.author.query(
        dates ? { id: 'u1', since: new Date(1) } : { id: 'u2' },
      ),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.runs).toHaveBeenCalledTimes(2);
    const transformer = inputHashFn.mock.calls[0]?.[0].transformer;
    const date = new Date(0);
    if (dates) {
      expect(transformer?.input).toBe(superjson);
      expect(transformer?.output).toBe(superjson);
    } else {
      // Without a transformer, one that changes nothing
      expect(transformer?.input.serialize(date)).toBe(date);
      expect(transformer?.output.serialize(date)).toBe(date);
    }
  });

  test.skipIf(scenario.transformer !== 'superjson')(
    'inputs that only the transformer can encode are compared as it encodes them',
    async () => {
      await using ctx = setup({ dedupeQueries: {} });

      // As JSON, every one of these maps is `{}`
      const results = await Promise.all([
        ctx.client.sizeOf.query(new Map([['a', 1]])),
        ctx.client.sizeOf.query(
          new Map([
            ['a', 1],
            ['b', 2],
          ]),
        ),
        ctx.client.sizeOf.query(new Map([['a', 1]])),
        ctx.client.sizeOf.query(new Map([['a', 2]])),
      ]);

      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
      expect(results).toEqual([1, 2, 1, 1]);
      expect(ctx.runs.mock.calls).toHaveLength(3);
      expect(ctx.runs.mock.calls).toEqual(
        expect.arrayContaining([
          ['sizeOf', new Map([['a', 1]])],
          [
            'sizeOf',
            new Map([
              ['a', 1],
              ['b', 2],
            ]),
          ],
          ['sizeOf', new Map([['a', 2]])],
        ]),
      );
    },
  );

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

  const streams = scenario.name === 'httpBatchStreamLink';
  /** What `httpBatchLink` answers a query that streams with */
  const cannotStream = {
    status: 'rejected',
    reason: { data: { code: 'UNSUPPORTED_MEDIA_TYPE' } },
  };

  test('a query that streams runs once, and every call gets the whole stream', async () => {
    await using ctx = setup({ dedupeQueries: {} });

    const results = await Promise.allSettled([
      ctx.client.countTo.query(3).then(readAll),
      ctx.client.countTo.query(3).then(readAll),
      ctx.client.countTo.query(3).then(readAll),
      // Another input
      ctx.client.countTo.query(2).then(readAll),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    if (!streams) {
      // As without the middleware
      expect(results).toMatchObject(results.map(() => cannotStream));
      expect(ctx.runs).not.toHaveBeenCalled();
      return;
    }
    expect(results).toEqual([
      { status: 'fulfilled', value: [1, 2, 3] },
      { status: 'fulfilled', value: [1, 2, 3] },
      { status: 'fulfilled', value: [1, 2, 3] },
      { status: 'fulfilled', value: [1, 2] },
    ]);
    expect(ctx.runs.mock.calls).toHaveLength(2);
    expect(ctx.runs.mock.calls).toEqual(
      expect.arrayContaining([
        ['countTo', 3],
        ['countTo', 2],
      ]),
    );
  });

  test.skipIf(!streams)(
    'a call that stops reading a stream leaves it whole for the others',
    async () => {
      await using ctx = setup({ dedupeQueries: {} });

      const results = await Promise.all([
        ctx.client.countTo.query(3).then(async (stream) => {
          for await (const value of stream) {
            return value;
          }
          return null;
        }),
        ctx.client.countTo.query(3).then(readAll),
      ]);

      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
      expect(results).toEqual([1, [1, 2, 3]]);
      expect(ctx.runs).toHaveBeenCalledTimes(1);
    },
  );

  test.skipIf(!streams)(
    'a stream that fails, fails for every call after what it yielded, and is reported for each',
    async () => {
      await using ctx = setup({ dedupeQueries: {} });

      const results = await Promise.all([
        ctx.client.failAfter.query(2).then(readUntilError),
        ctx.client.failAfter.query(2).then(readUntilError),
      ]);

      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
      expect(results).toMatchObject([
        { values: [1, 2], error: { data: { code: 'NOT_FOUND' } } },
        { values: [1, 2], error: { data: { code: 'NOT_FOUND' } } },
      ]);
      expect(ctx.runs).toHaveBeenCalledTimes(1);
      expect(ctx.onError).toHaveBeenCalledTimes(2);
    },
  );

  test('a query with a promise in its data runs once, and every call gets what it resolves to', async () => {
    await using ctx = setup({ dedupeQueries: {} });

    const results = await Promise.allSettled([
      ctx.client.profile.query({ id: 'u1' }),
      ctx.client.profile.query({ id: 'u1' }),
      ctx.client.profile.query({ id: 'u2' }),
    ]);

    expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
    expect(ctx.runs).toHaveBeenCalledTimes(2);
    if (!streams) {
      expect(results).toMatchObject(results.map(() => cannotStream));
      return;
    }
    const [first, again, other] = results.map((result) => {
      assert(result.status === 'fulfilled');
      return result.value;
    });
    assert(first && again && other);
    expect(again.run).toBe(first.run);
    expect(other.run).not.toBe(first.run);
    expect(again.posts).not.toBe(first.posts);
    expect(await Promise.all([first.posts, again.posts, other.posts])).toEqual([
      ["u1's first post"],
      ["u1's first post"],
      ["u2's first post"],
    ]);
  });

  test.skipIf(!streams)(
    'a promise that rejects, rejects for every call, and is reported for each',
    async () => {
      await using ctx = setup({ dedupeQueries: {} });

      const profiles = await Promise.all([
        ctx.client.profile.query({ id: 'missing' }),
        ctx.client.profile.query({ id: 'missing' }),
      ]);
      const posts = await Promise.allSettled(
        profiles.map((profile) => profile.posts),
      );

      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
      expect(posts).toMatchObject([
        { status: 'rejected', reason: { data: { code: 'NOT_FOUND' } } },
        { status: 'rejected', reason: { data: { code: 'NOT_FOUND' } } },
      ]);
      expect(ctx.runs).toHaveBeenCalledTimes(1);
      expect(ctx.onError).toHaveBeenCalledTimes(2);
    },
  );

  test.skipIf(!streams)(
    'every call gets the streams inside what a stream yields and a promise resolves to',
    async () => {
      await using ctx = setup({ dedupeQueries: {} });

      const read = async (
        feed: Awaited<ReturnType<typeof ctx.client.feed.query>>,
      ) => {
        const groups = [];
        for await (const group of feed) {
          const more = await group.more;
          groups.push({
            name: group.name,
            items: await readAll(group.items),
            more: { total: more.total, items: await readAll(more.items) },
          });
        }
        return groups;
      };
      const results = await Promise.all([
        ctx.client.feed.query().then(read),
        ctx.client.feed.query().then(read),
      ]);

      expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
      const whole = [
        { name: 'a', items: [1, 2], more: { total: 2, items: [3, 4] } },
        { name: 'b', items: [5], more: { total: 1, items: [6] } },
      ];
      expect(results).toEqual([whole, whole]);
      expect(ctx.runs).toHaveBeenCalledTimes(1);
    },
  );
});

describe('server-side calls, whose inputs and data never are JSON', () => {
  const t = initTRPC.context<Context>().create();
  const procedure = t.procedure.use(unstable_dedupeQueries());
  // As a WebSocket connection has: one context for every call
  const createCaller = <TRouter extends Parameters<typeof t.router>[0]>(
    record: TRouter,
  ) => t.createCallerFactory(t.router(record))({ user: 'KATT' });

  const loop: unknown[] = [];
  loop.push(loop);
  test.each([
    {
      name: 'maps',
      inputs: [new Map([['a', 1]]), new Map([['b', 2]])],
    },
    {
      name: 'a date and its JSON',
      inputs: [new Date(0), new Date(0).toJSON()],
    },
    { name: 'undefined and null in an array', inputs: [[undefined], [null]] },
    { name: 'NaN and null', inputs: [NaN, null] },
    { name: '-0 and 0', inputs: [-0, 0] },
    { name: 'a bigint and a number', inputs: [1n, 1] },
    {
      name: 'an instance of a class and an object',
      inputs: [new URL('http://localhost'), {}],
    },
    { name: 'an array that holds itself', inputs: [loop, loop] },
  ])(
    'without a transformer, $name have the same JSON and run for themselves',
    async (scenario) => {
      const runs = vi.fn();
      const caller = createCaller({
        typeOf: procedure.input(z.unknown()).query((call) => {
          runs(call.input);
          return Object.prototype.toString.call(call.input);
        }),
      });

      const results = await Promise.all(
        scenario.inputs.map((input) => caller.typeOf(input)),
      );

      expect(runs.mock.calls).toEqual(scenario.inputs.map((input) => [input]));
      expect(results).toEqual(
        scenario.inputs.map((input) => Object.prototype.toString.call(input)),
      );
    },
  );

  test('without a transformer, inputs that JSON can carry share a run', async () => {
    const runs = vi.fn();
    const caller = createCaller({
      run: procedure.input(z.unknown()).query((call) => {
        runs(call.input);
        return runs.mock.calls.length;
      }),
    });

    const results = await Promise.all([
      caller.run({ a: [1, 'x', null, true, { b: 0.5 }], c: undefined }),
      caller.run({ a: [1, 'x', null, true, { b: 0.5 }] }),
      caller.run(undefined),
      caller.run(undefined),
      caller.run(null),
      caller.run(''),
      caller.run('null'),
    ]);

    expect(results).toEqual([1, 1, 2, 2, 3, 4, 5]);
  });

  test('a call that shares its run with no other gets the data as it is', async () => {
    const stream = streamOf(1, 2);
    const data = { stream, promise: Promise.resolve(1) };
    const caller = createCaller({
      stream: procedure.query(() => stream),
      data: procedure.query(() => data),
    });

    expect(await caller.stream()).toBe(stream);
    expect(await caller.data()).toBe(data);
  });

  test('data without a stream or a promise is the same for every call', async () => {
    const data = { id: 'u1', tags: ['a'] };
    const caller = createCaller({ data: procedure.query(() => data) });

    const results = await Promise.all([caller.data(), caller.data()]);

    expect(results[0]).toBe(data);
    expect(results[1]).toBe(data);
  });

  test('a stream is read as far as the call that reads the furthest, and returned when every call has stopped', async () => {
    const pulled = vi.fn();
    const closed = vi.fn();
    const caller = createCaller({
      count: procedure.query(async function* () {
        try {
          for (let i = 1; ; i++) {
            pulled(i);
            yield i;
          }
        } finally {
          closed();
        }
      }),
    });

    const [first, second, third] = await Promise.all([
      caller.count(),
      caller.count(),
      caller.count(),
    ]);
    expect(second).not.toBe(first);
    // Nothing is read before a call asks
    expect(pulled).not.toHaveBeenCalled();

    expect(await first.next()).toEqual({ done: false, value: 1 });
    expect(await first.next()).toEqual({ done: false, value: 2 });
    await stop(first);
    expect(await first.next()).toEqual({ done: true, value: undefined });
    expect(closed).not.toHaveBeenCalled();

    // A call that never reads
    await stop(third);
    expect(closed).not.toHaveBeenCalled();

    // What another call read is kept for this one
    expect(await second.next()).toEqual({ done: false, value: 1 });
    expect(await second.next()).toEqual({ done: false, value: 2 });
    expect(pulled).toHaveBeenCalledTimes(2);
    expect(await second.next()).toEqual({ done: false, value: 3 });
    expect(pulled).toHaveBeenCalledTimes(3);

    await stop(second);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(pulled).toHaveBeenCalledTimes(3);
  });

  test("calls that read at the same time don't read the stream twice", async () => {
    const caller = createCaller({
      count: procedure.query(async function* () {
        yield 1;
        yield 2;
        return 'end';
      }),
    });

    const [first, second] = await Promise.all([caller.count(), caller.count()]);
    const steps = await Promise.all([
      first.next(),
      second.next(),
      first.next(),
      second.next(),
      first.next(),
      second.next(),
      first.next(),
    ]);

    expect(steps).toEqual([
      { done: false, value: 1 },
      { done: false, value: 1 },
      { done: false, value: 2 },
      { done: false, value: 2 },
      // What the stream returns is for every call too
      { done: true, value: 'end' },
      { done: true, value: 'end' },
      { done: true, value: undefined },
    ]);
  });

  test.each([
    { name: 'that a call left unread', stops: 'after' },
    { name: 'that is yielded after a call stopped', stops: 'before' },
  ] as const)(
    'a stream inside a value $name is returned when the other calls have stopped',
    async (scenario) => {
      const closed = vi.fn();
      const caller = createCaller({
        feed: procedure.query(async function* () {
          yield {
            items: (async function* () {
              try {
                yield 1;
                yield 2;
              } finally {
                closed();
              }
            })(),
          };
        }),
      });

      const [first, second] = await Promise.all([caller.feed(), caller.feed()]);
      if (scenario.stops === 'before') {
        await stop(second);
      }
      const group = await first.next();
      assert(!group.done);
      if (scenario.stops === 'after') {
        // It has a copy of that value waiting, with a stream in it
        await stop(second);
      }

      expect(await group.value.items.next()).toEqual({ done: false, value: 1 });
      await stop(group.value.items);

      expect(closed).toHaveBeenCalledTimes(1);
    },
  );
});

test('a procedure builder without a root config gets a transformer that changes nothing', async () => {
  const t = initTRPC.context<Context>().create({ transformer: superjson });
  const runs = vi.fn();
  const inputHashFn = vi.fn<InputHashFn>(() => null);
  // Not from `t.procedure`, so it doesn't know the router's transformer
  const procedure = createBuilder<Context, object>();
  const appRouter = t.router({
    since: procedure
      .use(unstable_dedupeQueries())
      .input(z.date())
      .query((call) => {
        runs('since', call.input);
        return call.input;
      }),
    byId: procedure
      .use(unstable_dedupeQueries())
      .input(z.string())
      .query((call) => {
        runs('byId', call.input);
        return call.input;
      }),
    hashed: procedure
      .use(unstable_dedupeQueries({ inputHashFn }))
      .input(z.date())
      .query((call) => call.input),
  });
  await using ctx = testServerAndClientResource(appRouter, {
    server: { createContext: () => ({ user: 'KATT' }) },
  });
  const date = new Date(0);

  await Promise.all([
    // A date isn't JSON until a transformer encodes it
    ctx.client.since.query(date),
    ctx.client.since.query(date),
    ctx.client.byId.query('u1'),
    ctx.client.byId.query('u1'),
    ctx.client.hashed.query(date),
  ]);

  expect(ctx.onRequestSpy).toHaveBeenCalledTimes(1);
  expect(runs.mock.calls).toHaveLength(3);
  expect(runs.mock.calls).toEqual(
    expect.arrayContaining([
      ['since', date],
      ['since', date],
      ['byId', 'u1'],
    ]),
  );
  const transformer = inputHashFn.mock.calls[0]?.[0].transformer;
  expect(transformer?.input.serialize(date)).toBe(date);
});

test('a context that outlives a request shares only the calls in flight', async () => {
  const t = initTRPC.context<Context>().create();
  const runs = vi.fn();
  const appRouter = t.router({
    author: t.procedure
      .use(unstable_dedupeQueries())
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
