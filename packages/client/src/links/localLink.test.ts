import type { AnyRouter } from '@trpc/server';
import { initTRPC, tracked } from '@trpc/server';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';
import { createTRPCClient } from '../createTRPCClient';
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

  expect(typeof result).toBe('string');
  expect(result).toBe(date.toJSON());
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

  const events = Array.from({ length: 10 }, (_, i) => `event-${i}`);

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
          // throw an error every 3rd event
          if (i % 3 === 0) {
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
      { lastEventId: '0' },
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
      Object {
        "data": "event-5",
        "id": "5",
      },
      Object {
        "data": "event-6",
        "id": "6",
      },
      Object {
        "data": "event-7",
        "id": "7",
      },
      Object {
        "data": "event-8",
        "id": "8",
      },
      Object {
        "data": "event-9",
        "id": "9",
      },
    ]
  `);
});
