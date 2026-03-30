import { waitError } from '@trpc/server/__tests__/waitError';
import type { AnyRouter } from '@trpc/server';
import { initTRPC, tracked, TRPCError } from '@trpc/server';
import { makeResource, run } from '@trpc/server/unstable-core-do-not-import';
import superjson from 'superjson';
import { z } from 'zod';
import { createTRPCClient } from '../createTRPCClient';
import { isTRPCClientError } from '../TRPCClientError';
import type { LocalLinkOptions } from './localLink';
import { experimental_localLink as localLink } from './localLink';

async function aggregateAsyncIterable<TYield, TReturn>(
  iterable: AsyncIterable<TYield, TReturn>,
) {
  const items: TYield[] = [];

  try {
    const iterator = iterable[Symbol.asyncIterator]();

    while (true) {
      const res = await iterator.next();
      if (res.done) {
        return {
          items,
          ok: true as const,
          return: res.value,
        };
      }
      items.push(res.value);
    }
  } catch (error: unknown) {
    return {
      error,
      items,
      ok: false as const,
    };
  }
}

function localLinkClient<TRouter extends AnyRouter>(
  opts: LocalLinkOptions<TRouter>,
) {
  const onError = vi.fn<NonNullable<LocalLinkOptions<TRouter>['onError']>>();
  const client = createTRPCClient<TRouter>({
    links: [
      localLink({
        onError,
        ...opts,
      }),
    ],
  });

  return {
    client,
    onError,
  };
}

test('smoke', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    hello: t.procedure.query(() => 'hello'),
  });

  const client = createTRPCClient({
    links: [
      localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });

  const result = await client.hello.query();

  expect(result).toBe('hello');
});

test('json serialization', async () => {
  const t = initTRPC.create();

  const date = new Date(2025, 1, 1);

  const appRouter = t.router({
    hello: t.procedure.query(() => date),
    undef: t.procedure.query(() => undefined),
  });

  const client = createTRPCClient<typeof appRouter>({
    links: [
      localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });

  {
    const result = await client.hello.query();

    expect(typeof result).toBe('string');
    expect(result).toBe(date.toJSON());
  }
  {
    const result = await client.undef.query();

    expect(result).toBeUndefined();
  }
});

test('handles async generator', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    hello: t.procedure.query(async function* () {
      yield 'hello';
      yield 'world';

      return 'ended';
    }),
  });

  const client = createTRPCClient<typeof appRouter>({
    links: [
      localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });

  const result = await client.hello.query();

  const aggregated = await aggregateAsyncIterable(result);

  expect(aggregated.items).toEqual(['hello', 'world']);
  expect(aggregated.return).toBe('ended');
});

test('handles async generator with abort', async () => {
  const t = initTRPC.create();
  const ac = new AbortController();

  const cleanup = vi.fn();

  const appRouter = t.router({
    hello: t.procedure.query(async function* () {
      using _finally = makeResource({}, cleanup);

      yield 'hello';
      ac.abort();
      yield 'world';
    }),
  });

  const client = createTRPCClient<typeof appRouter>({
    links: [
      localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });

  const result = await client.hello.query(undefined, {
    signal: ac.signal,
  });

  const aggregated = await aggregateAsyncIterable(result);

  expect(aggregated.items).toEqual(['hello']);
  expect(aggregated.ok).toBe(false);

  expect(cleanup).toHaveBeenCalled();
});

test('async generator with break', async () => {
  const t = initTRPC.create();

  const cleanup = vi.fn();

  const appRouter = t.router({
    hello: t.procedure.query(async function* () {
      using _finally = makeResource({}, cleanup);

      yield 'hello';
      yield 'world';
    }),
  });

  const client = createTRPCClient<typeof appRouter>({
    links: [
      localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });

  const result = await client.hello.query();

  for await (const item of result) {
    if (item === 'hello') {
      break;
    }
  }

  expect(cleanup).toHaveBeenCalled();
});

test('subscription', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    hello: t.procedure.subscription(async function* () {
      yield 'hello';
      yield 'world';
    }),
  });

  const client = createTRPCClient<typeof appRouter>({
    links: [
      localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });

  const result = await new Promise<string[]>((resolve) => {
    const aggregated: string[] = [];
    client.hello.subscribe(undefined, {
      onData: (data) => {
        aggregated.push(data);
      },
      onComplete: () => {
        resolve(aggregated);
      },
    });
  });

  expect(result).toEqual(['hello', 'world']);
});

test('subscription reconnects on errors', async () => {
  const t = initTRPC.create();

  let firstRun = true;

  const appRouter = t.router({
    hello: t.procedure.subscription(async function* () {
      if (firstRun) {
        yield 'hello';
        firstRun = false;
        throw new Error('test');
      }
      yield 'world';
    }),
  });

  const ctx = localLinkClient<typeof appRouter>({
    router: appRouter,
    createContext: async () => ({}),
  });
  const { client } = ctx;

  const result = await new Promise<string[]>((resolve) => {
    const aggregated: string[] = [];
    client.hello.subscribe(undefined, {
      onData: (data) => {
        aggregated.push(data);
      },
      onComplete: () => {
        resolve(aggregated);
      },
    });
  });

  expect(ctx.onError).toHaveBeenCalledOnce();
  expect(ctx.onError.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "ctx": Object {},
          "error": [TRPCError: test],
          "input": undefined,
          "path": "hello",
          "type": "subscription",
        },
      ],
    ]
  `);

  expect(result).toEqual(['hello', 'world']);
});

test('subscription reconnects on errors with the last event id', async () => {
  const t = initTRPC.create();

  const events = Array.from({ length: 5 }, (_, i) => `event-${i}`);

  const appRouter = t.router({
    hello: t.procedure
      .input(
        z.object({
          lastEventId: z.string().optional(),
        }),
      )
      .subscription(async function* (opts) {
        const start = opts.input.lastEventId
          ? Number(opts.input.lastEventId) + 1
          : 0;
        for (let i = start; i < events.length; i++) {
          const data = events[i]!;
          yield tracked(String(i), data);
          // throw an error every second event
          if (i % 2 === 0) {
            throw new Error(`Threw on event ${i}`);
          }
        }
      }),
  });

  const ctx = localLinkClient<typeof appRouter>({
    router: appRouter,
    createContext: async () => ({}),
  });
  const { client } = ctx;

  type Data = { id: string; data: string };
  const result = await new Promise<Data[]>((resolve) => {
    const aggregated: Data[] = [];
    client.hello.subscribe(
      {},
      {
        onData: (data) => {
          aggregated.push(data);
        },
        onComplete: () => {
          resolve(aggregated);
        },
      },
    );
  });

  expect(result).toMatchInlineSnapshot(`
    Array [
      Object {
        "data": "event-0",
        "id": "0",
      },
      Object {
        "data": "event-1",
        "id": "1",
      },
      Object {
        "data": "event-2",
        "id": "2",
      },
      Object {
        "data": "event-3",
        "id": "3",
      },
      Object {
        "data": "event-4",
        "id": "4",
      },
    ]
  `);
  expect(ctx.onError).toHaveBeenCalledTimes(3);
  expect(ctx.onError.mock.calls).toMatchInlineSnapshot(`
    Array [
      Array [
        Object {
          "ctx": Object {},
          "error": [TRPCError: Threw on event 0],
          "input": Object {},
          "path": "hello",
          "type": "subscription",
        },
      ],
      Array [
        Object {
          "ctx": Object {},
          "error": [TRPCError: Threw on event 2],
          "input": Object {
            "lastEventId": "0",
          },
          "path": "hello",
          "type": "subscription",
        },
      ],
      Array [
        Object {
          "ctx": Object {},
          "error": [TRPCError: Threw on event 4],
          "input": Object {
            "lastEventId": "2",
          },
          "path": "hello",
          "type": "subscription",
        },
      ],
    ]
  `);
});

test('forwards origin error as cause when using localLink', async () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    throwError: t.procedure.query(() => {
      throw new Error('original error');
    }),
    throwTRPCError: t.procedure.query(() => {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'not allowed' });
    }),
  });

  const client = createTRPCClient<typeof appRouter>({
    links: [
      localLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });

  {
    const err = await waitError(client.throwError.query());
    assert(isTRPCClientError<typeof appRouter>(err));
    expect(err.cause).toBeInstanceOf(Error);
    expect(err.cause?.message).toBe('original error');
  }

  {
    const err = await waitError(client.throwTRPCError.query());
    assert(isTRPCClientError<typeof appRouter>(err));
    expect(err.cause).toBeInstanceOf(TRPCError);
    expect((err.cause as TRPCError).code).toBe('UNAUTHORIZED');
    expect(err.cause?.message).toBe('not allowed');
  }
});

test('error formatting', async () => {
  const t = initTRPC.create({
    errorFormatter: (opts) => {
      return {
        ...opts.shape,
        data: {
          ...opts.shape.data,
          foo: 'bar' as const,
          stack: 'redacted',
        },
      };
    },
  });

  const appRouter = t.router({
    hello: t.procedure.query(() => {
      throw new Error('test');
    }),
    iterate: t.procedure.query(async function* () {
      yield 'hello';
      throw new TRPCError({
        code: 'BAD_GATEWAY',
      });
    }),
  });

  const ctx = localLinkClient<typeof appRouter>({
    router: appRouter,
    createContext: async () => ({}),
  });
  const { client } = ctx;

  {
    const err = await waitError(client.hello.query());
    assert(isTRPCClientError<typeof appRouter>(err));

    expect(err.data).toMatchObject({
      foo: 'bar',
    });
    expect(err.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32603,
        "data": Object {
          "code": "INTERNAL_SERVER_ERROR",
          "foo": "bar",
          "httpStatus": 500,
          "path": "hello",
          "stack": "redacted",
        },
        "message": "test",
      }
    `);
  }

  {
    const err = await waitError(
      run(async function () {
        for await (const _ of await client.iterate.query()) {
          // ..
        }
      }),
    );
    assert(isTRPCClientError<typeof appRouter>(err));

    expect(err.data).toMatchObject({
      foo: 'bar',
    });
    expect(err.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32603,
        "data": Object {
          "code": "BAD_GATEWAY",
          "foo": "bar",
          "httpStatus": 502,
          "path": "iterate",
          "stack": "redacted",
        },
        "message": "BAD_GATEWAY",
      }
    `);
  }
});

test('with transformer', async () => {
  const t = initTRPC.create({
    transformer: superjson,
  });

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      return {
        foo: Promise.resolve('bar'),
      };
    }),
  });

  const ctx = localLinkClient<typeof appRouter>({
    router: appRouter,
    createContext: async () => ({}),
    transformer: superjson,
  });
  const { client } = ctx;

  const result = await client.greeting.query();

  expect(result.foo).toBeInstanceOf(Promise);

  expect(await result.foo).toBe('bar');
});
