// @vitest-environment miniflare
/// <reference types="@cloudflare/workers-types" />
import { ReadableStream as MiniflareReadableStream } from 'stream/web';
import { Response as MiniflareResponse } from '@miniflare/core';
import {
  createTRPCProxyClient,
  httpBatchLink,
  TRPCLink,
  unstable_httpBatchStreamLink,
} from '@trpc/client';
import { initTRPC } from '@trpc/server';
import {
  FetchCreateContextFnOptions,
  fetchRequestHandler,
} from '@trpc/server/adapters/fetch';
import { observable, tap } from '@trpc/server/observable';
import { Miniflare } from 'miniflare';
import { z } from 'zod';

// miniflare does an instanceof check
globalThis.Response = MiniflareResponse as any;
// miniflare must use the web stream "polyfill"
globalThis.ReadableStream = MiniflareReadableStream as any;

const port = 8788;
const url = `http://localhost:${port}`;

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
  });

  return appRouter;
}

type AppRouter = ReturnType<typeof createAppRouter>;

async function startServer() {
  const router = createAppRouter();

  const mf = new Miniflare({
    script: '//',
    port,
    compatibilityFlags: ['streams_enable_constructors'],
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
  const orderedResults: number[] = [];
  const linkSpy: TRPCLink<AppRouter> = () => {
    // here we just got initialized in the app - this happens once per app
    // useful for storing cache for instance
    return ({ next, op }) => {
      // this is when passing the result to the next link
      // each link needs to return an observable which propagates results
      return observable((observer) => {
        const unsubscribe = next(op).subscribe({
          next(value) {
            orderedResults.push((value.result as any).data);
            observer.next(value);
          },
          error: observer.error,
        });
        return unsubscribe;
      });
    };
  };

  const client = createTRPCProxyClient<AppRouter>({
    links: [
      linkSpy,
      unstable_httpBatchStreamLink({
        url,
        fetch: fetch as any,
      }),
    ],
  });

  const results = await Promise.all([
    client.deferred.query({ wait: 3 }),
    client.deferred.query({ wait: 1 }),
    client.deferred.query({ wait: 2 }),
  ]);
  expect(results).toEqual([3, 1, 2]);
  expect(orderedResults).toEqual([1, 2, 3]);
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
