/**
 * @jest-environment miniflare
 */
/// <reference types="@cloudflare/workers-types" />
import { Response as MiniflareResponse } from '@miniflare/core';
import { TRPCLink, createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import {
  FetchCreateContextFnOptions,
  fetchRequestHandler,
} from '@trpc/server/adapters/fetch';
import { tap } from '@trpc/server/observable';
import { Miniflare } from 'miniflare';
import { z } from 'zod';

// miniflare does an instanceof check
globalThis.Response = MiniflareResponse as any;

const port = 8788;
const url = `http://localhost:${port}`;

const createContext = ({
  req,
  resHeaders,
  info,
}: FetchCreateContextFnOptions) => {
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
    info,
  };
};

type Context = inferAsyncReturnType<typeof createContext>;

function createAppRouter() {
  const t = initTRPC.context<Context>().create();
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
      .query(({ input, ctx }) => ({
        text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}`,
      })),
    foo: publicProcedure.query(({ ctx }) => {
      ctx.resHeaders.set('x-foo', 'bar');
      return 'foo';
    }),
    request: router({
      info: publicProcedure.query(({ ctx }) => {
        return ctx.info;
      }),
    }),
  });

  return appRouter;
}

type AppRouter = ReturnType<typeof createAppRouter>;

async function startServer() {
  const router = createAppRouter();

  const mf = new Miniflare({
    script: '//',
    port,
  });
  const globalScope = await mf.getGlobalScope();
  globalScope.addEventListener('fetch', (event: FetchEvent) => {
    const response = fetchRequestHandler({
      endpoint: '',
      req: event.request,
      router,
      createContext,
      responseMeta() {
        return {
          headers: {},
        };
      },
    });
    event.respondWith(response);
  });
  const server = await mf.startServer();

  const client = createTRPCProxyClient<typeof router>({
    links: [httpBatchLink({ url, fetch: fetch as any })],
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => {
          err ? reject(err) : resolve();
        }),
      ),
    router,
    client,
  };
}

let t: inferAsyncReturnType<typeof startServer>;
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

test('query with headers', async () => {
  const client = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
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

  const client = createTRPCProxyClient<AppRouter>({
    links: [
      customLink,
      httpBatchLink({
        url,
        fetch: fetch as any,
        headers: { authorization: 'meow' },
      }),
    ],
  });

  await client.foo.query();
});

test('request info', async () => {
  const client = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url,
        fetch: fetch as any,
      }),
    ],
  });

  const res = await Promise.all([
    client.hello.query(),
    client.hello.query({ who: 'test' }),
    client.request.info.query(),
  ]);

  expect(res).toMatchInlineSnapshot(`
    Array [
      Object {
        "text": "hello world",
      },
      Object {
        "text": "hello test",
      },
      Object {
        "calls": Array [
          Object {
            "path": "hello",
            "type": "query",
          },
          Object {
            "input": Object {
              "who": "test",
            },
            "path": "hello",
            "type": "query",
          },
          Object {
            "path": "request.info",
            "type": "query",
          },
        ],
        "isBatchCall": true,
      },
    ]
  `);
});
