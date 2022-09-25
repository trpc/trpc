/**
 * @jest-environment miniflare
 */
/// <reference types="@cloudflare/workers-types" />
import { Context, router } from './__router';
import { Response as MiniflareResponse } from '@miniflare/core';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { Miniflare } from 'miniflare';
import fetch from 'node-fetch';
import * as trpc from '../../../src';
import * as trpcFetch from '../../../src/adapters/fetch';

// miniflare does an instanceof check
global.Response = MiniflareResponse as any;

const port = 8787;
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

  const client = createTRPCClient<typeof router>({
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
    await t.client.query('hello', {
      who: 'test',
    }),
  ).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);

  expect(await t.client.query('hello')).toMatchInlineSnapshot(`
    Object {
      "text": "hello world",
    }
  `);
});

test('query with headers', async () => {
  const client = createTRPCClient<typeof router>({
    links: [
      httpBatchLink({
        url,
        fetch: fetch as any,
        headers: { authorization: 'meow' },
      }),
    ],
  });

  expect(await client.query('hello')).toMatchInlineSnapshot(`
    Object {
      "text": "hello KATT",
    }
  `);
});
