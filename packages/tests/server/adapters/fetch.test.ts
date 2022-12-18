/**
 * @jest-environment miniflare
 */
/// <reference types="@cloudflare/workers-types" />
import { Context, router } from './__router';
import { Response as MiniflareResponse } from '@miniflare/core';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client/src';
import * as trpc from '@trpc/server/src';
import * as trpcFetch from '@trpc/server/src/adapters/fetch';
import { Miniflare } from 'miniflare';

// miniflare does an instanceof check
globalThis.Response = MiniflareResponse as any;

const port = 8788;
const url = `http://localhost:${port}`;

const createContext = ({
  req,
}: trpcFetch.FetchCreateContextFnOptions): Context => {
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
  };
};

export async function handleRequest(request: Request): Promise<Response> {
  return trpcFetch.fetchRequestHandler({
    endpoint: '',
    req: request,
    router,
    createContext,
    responseMeta() {
      return {
        headers: {},
      };
    },
  });
}

async function startServer() {
  const mf = new Miniflare({
    script: '//',
    port,
  });
  const globalScope = await mf.getGlobalScope();
  globalScope.addEventListener('fetch', (event: FetchEvent) => {
    event.respondWith(handleRequest(event.request));
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

let t: trpc.inferAsyncReturnType<typeof startServer>;
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
  const client = createTRPCProxyClient<typeof router>({
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
