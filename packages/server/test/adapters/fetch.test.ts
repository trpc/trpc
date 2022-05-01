/**
 * @jest-environment miniflare
 */
/// <reference types="@cloudflare/workers-types" />
import { Response as MiniflareResponse } from '@miniflare/core';
import { Miniflare } from 'miniflare';
import fetch from 'node-fetch';
import { z } from 'zod';
import { createTRPCClient } from '../../../client/src';
import * as trpc from '../../src';
import * as trpcFetch from '../../src/adapters/fetch';

// polyfill
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.Response = MiniflareResponse;

export type Context = {
  user: {
    name: string;
  } | null;
};

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

export const router = trpc.router<Context>().query('hello', {
  input: z
    .object({
      who: z.string().nullish(),
    })
    .nullish(),
  resolve({ input, ctx }) {
    return {
      text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}`,
    };
  },
});

export async function handleRequest(request: Request): Promise<Response> {
  return trpcFetch.fetchRequestHandler({
    endpoint: '',
    req: request,
    router,
    createContext,
  });
}

async function startServer() {
  const port = 8787;

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
    url: `http://localhost:${port}`,

    AbortController: AbortController as any,
    fetch: fetch as any,
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => {
          err ? reject(err) : resolve();
        }),
      ),
    port,
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
