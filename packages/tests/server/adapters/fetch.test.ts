import type { TRPCLink } from '@trpc/client';
import {
  createTRPCClient,
  httpBatchLink,
  httpBatchStreamLink,
} from '@trpc/client';
import { initTRPC, TRPCError } from '@trpc/server';
import type { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { observable, tap } from '@trpc/server/observable';
import {
  run,
  type RuntimeConfigOptions,
} from '@trpc/server/unstable-core-do-not-import';
import {
  makeAsyncResource,
  makeResource,
} from '@trpc/server/unstable-core-do-not-import/stream/utils/disposable';
import { serve } from 'srvx';
import { z } from 'zod';

const createContext = ({ req, resHeaders }: FetchCreateContextFnOptions) => {
  const getUser = () => {
    if (req.headers.get('authorization') === 'meow') {
      return {
        name: 'KATT',
      };
    }
    return null;
  };

  return {
    user: getUser(),
    resHeaders,
  };
};

type Context = Awaited<ReturnType<typeof createContext>>;

type AppRouterServerOptions = Pick<
  RuntimeConfigOptions<Context, object>,
  'jsonl'
>;

function createAppRouter(opts?: AppRouterServerOptions) {
  const t = initTRPC.context<Context>().create(opts);
  const router = t.router;
  const publicProcedure = t.procedure;

  const appRouter = router({
    hello: publicProcedure
      .input(
        z
          .object({
            who: z.string().nullish(),
          })
          .nullish(),
      )
      .query((opts) => ({
        text: `hello ${opts.input?.who ?? opts.ctx.user?.name ?? 'world'}`,
      })),
    foo: publicProcedure.query((opts) => {
      opts.ctx.resHeaders.set('x-foo', 'bar');
      return 'foo';
    }),
    deferred: publicProcedure
      .input(
        z.object({
          wait: z.number(),
        }),
      )
      .query(async (opts) => {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, opts.input.wait * 10),
        );
        return opts.input.wait;
      }),
    helloMutation: publicProcedure.input(z.string()).mutation((opts) => {
      return `hello ${opts.input}`;
    }),
  });

  return appRouter;
}

type AppRouter = ReturnType<typeof createAppRouter>;

function getResponseContentType(context: unknown) {
  if (
    typeof context === 'object' &&
    context !== null &&
    'response' in context &&
    context.response instanceof Response
  ) {
    return context.response.headers.get('content-type');
  }
  return null;
}

function createStreamSpy() {
  const data: unknown[] = [];
  const contentTypes: (string | null)[] = [];
  const link: TRPCLink<AppRouter> = () => {
    return ({ next, op }) => {
      return observable((observer) => {
        const unsubscribe = next(op).subscribe({
          next(value) {
            data.push(value.result.data);
            contentTypes.push(getResponseContentType(value.context));
            observer.next(value);
          },
          error: observer.error,
          complete() {
            observer.complete();
          },
        });
        return unsubscribe;
      });
    };
  };

  return { data, contentTypes, link };
}

async function startServer(
  endpoint = '',
  routerOptions?: AppRouterServerOptions,
) {
  const router = createAppRouter(routerOptions);

  const server = serve({
    port: 0,
    fetch: (request) => {
      const response = fetchRequestHandler({
        endpoint,
        req: request,
        router,
        createContext,
      });
      return response;
    },
  });
  await server.ready();
  if (!server.url) {
    throw new Error('server.url is undefined');
  }

  const trimSlashes = (path: string): string => {
    path = path.startsWith('/') ? path.slice(1) : path;
    path = path.endsWith('/') ? path.slice(0, -1) : path;

    return path;
  };
  const path = trimSlashes(endpoint);
  const url = `${trimSlashes(server.url)}${path && `/${path}`}`;

  const client = createTRPCClient<typeof router>({
    links: [httpBatchLink({ url, fetch: fetch as any })],
  });

  return {
    url,
    close: server.close.bind(server),
    router,
    client,
  };
}

describe('with default server', () => {
  let t: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => {
    t = await startServer();
  });
  afterAll(async () => {
    await t.close();
  });

  test('simple query', async () => {
    expect(
      await t.client.hello.query({
        who: 'test',
      }),
    ).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);

    expect(await t.client.hello.query()).toMatchInlineSnapshot(`
    Object {
      "text": "hello world",
    }
  `);
  });

  test('streaming', async () => {
    const spy = createStreamSpy();

    const client = createTRPCClient<AppRouter>({
      links: [
        spy.link,
        httpBatchStreamLink({
          url: t.url,
          fetch,
        }),
      ],
    });

    const results = await Promise.all([
      client.deferred.query({ wait: 3 }),
      client.deferred.query({ wait: 1 }),
      client.deferred.query({ wait: 2 }),
    ]);

    expect(results).toEqual([3, 1, 2]);
    expect(spy.data).toEqual([1, 2, 3]);
    expect([...new Set(spy.contentTypes)]).toEqual(['application/json']);
  });

  test.each([
    'application/jsonl',
    'application/x-ndjson',
    'text/plain',
  ] as const)('streaming can opt into %s content-type', async (contentType) => {
    const server = await startServer('', {
      jsonl: {
        contentType,
      },
    });
    await using custom = makeAsyncResource(server, server.close);
    const spy = createStreamSpy();

    const client = createTRPCClient<AppRouter>({
      links: [
        spy.link,
        httpBatchStreamLink({
          url: custom.url,
          fetch,
        }),
      ],
    });

    const results = await Promise.all([
      client.deferred.query({ wait: 3 }),
      client.deferred.query({ wait: 1 }),
      client.deferred.query({ wait: 2 }),
    ]);

    expect(results).toEqual([3, 1, 2]);
    expect(spy.data).toEqual([1, 2, 3]);
    expect([...new Set(spy.contentTypes)]).toEqual([contentType]);
  });

  test('query with headers', async () => {
    const client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: t.url,
          fetch: fetch as any,
          headers: { authorization: 'meow' },
        }),
      ],
    });

    expect(await client.hello.query()).toMatchInlineSnapshot(`
    Object {
      "text": "hello KATT",
    }
  `);
  });

  test('response with headers', async () => {
    const customLink: TRPCLink<AppRouter> = () => {
      return ({ next, op }) => {
        return next(op).pipe(
          tap({
            next(result) {
              const context = result.context as { response: Response };
              expect(context.response.headers.get('x-foo')).toBe('bar');
            },
          }),
        );
      };
    };

    const client = createTRPCClient<AppRouter>({
      links: [
        customLink,
        httpBatchLink({
          url: t.url,
          fetch: fetch as any,
          headers: { authorization: 'meow' },
        }),
      ],
    });

    await client.foo.query();
  });
});

test.each([
  // https://github.com/trpc/trpc/pull/4893
  '/',
  'trpc',
  /// https://github.com/trpc/trpc/issues/5089
  'trpc/',
  '/trpc/',
  '/x/y/z',
])('with "%s" endpoint', async (endpoint) => {
  const custom = await startServer(endpoint);
  expect(
    await custom.client.hello.query({
      who: 'test',
    }),
  ).toEqual({
    text: 'hello test',
  });

  await custom.close();
});

// https://github.com/trpc/trpc/issues/5659
test('mutation', async () => {
  const t = await startServer();

  const res = await Promise.all([
    t.client.helloMutation.mutate('world'),
    t.client.helloMutation.mutate('KATT'),
  ]);
  expect(res).toEqual(['hello world', 'hello KATT']);

  await t.close();
});

test('batching', async () => {
  const t = await startServer();

  const normalResult = await (
    await fetch(`${t.url}/hello,foo?batch=1&input={}`)
  ).json();
  const comma = '%2C';
  const urlEncodedResult = await (
    await fetch(`${t.url}/hello${comma}foo?batch=1&input={}`)
  ).json();

  expect(normalResult).toEqual(urlEncodedResult);
});

test.each([
  ['completes', 'completes', { startsTimer: true }],
  ['throws', 'throws', { startsTimer: false }],
  ['is cancelled', 'infinite', { startsTimer: true }],
  ['fails in responseMeta', 'responseMetaThrows', { startsTimer: false }],
  ['errors the stream', 'streamErrors', { startsTimer: true }],
] as const)(
  'sse maxDurationMs timer is not left pending when the subscription %s',
  async (_, path, { startsTimer }) => {
    const nonce = Math.floor(Math.random() * 1000);
    const MAX_DURATION_MS = 60_000 * 60 * 24 + nonce; // 1 day + nonce

    using timeoutSpies = run(() => {
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      return makeResource(
        {
          setTimeoutSpy,
          clearTimeoutSpy,
        },
        () => {
          setTimeoutSpy.mockRestore();
          clearTimeoutSpy.mockRestore();
        },
      );
    });

    const t = initTRPC.create({
      sse: {
        maxDurationMs: MAX_DURATION_MS,
      },
    });
    const router = t.router({
      completes: t.procedure.subscription(async function* () {
        yield 1;
      }),
      throws: t.procedure
        .use(() => {
          throw new TRPCError({ code: 'UNAUTHORIZED' });
        })
        .subscription(async function* () {
          yield 1;
        }),
      infinite: t.procedure.subscription(async function* () {
        for (;;) {
          yield 1;
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }),
      responseMetaThrows: t.procedure.subscription(async function* () {
        yield 1;
      }),
      streamErrors: t.procedure.subscription(async function* () {
        yield 1;
        throw new Error('subscription failed');
      }),
    });

    // the signal of this request never aborts
    const res = await fetchRequestHandler({
      endpoint: '',
      router,
      req: new Request(`http://localhost/${path}`),
      responseMeta(opts) {
        if (
          opts.info?.calls[0]?.path === 'responseMetaThrows' &&
          opts.errors.length === 0
        ) {
          throw new Error('responseMeta failed');
        }
        return {};
      },
      onError(opts) {
        if (opts.path === 'streamErrors') {
          // a throwing `onError` makes the SSE stream itself error
          throw new Error('onError failed');
        }
      },
    });
    if (path === 'infinite') {
      assert(res.body);
      const reader = res.body.getReader();
      await reader.read();
      await reader.cancel();
    } else if (path === 'streamErrors') {
      await expect(res.text()).rejects.toThrow();
    } else {
      await res.text();
    }

    const maxDurationTimers = timeoutSpies.setTimeoutSpy.mock.calls.flatMap(
      (args, index) => {
        const result = timeoutSpies.setTimeoutSpy.mock.results[index];
        return args[1] === MAX_DURATION_MS && result?.type === 'return'
          ? [result.value]
          : [];
      },
    );
    expect(maxDurationTimers).toHaveLength(startsTimer ? 1 : 0);

    const clearedTimers = timeoutSpies.clearTimeoutSpy.mock.calls.map(
      ([timer]) => timer,
    );
    expect(
      maxDurationTimers.filter((timer) => !clearedTimers.includes(timer)),
    ).toEqual([]);
  },
);
