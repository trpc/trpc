/* eslint-disable @typescript-eslint/no-explicit-any */
import AbortController from 'abort-controller';
import bodyParser from 'body-parser';
import express from 'express';
import http from 'http';
import fetch from 'node-fetch';
import * as z from 'zod';
import { createTRPCClient } from '../../client/src';
import * as trpc from '../src';

type Context = {
  user: {
    name: string;
  } | null;
};
async function startServer() {
  const createContext = (_opts: trpc.CreateExpressContextOptions): Context => {
    const getUser = () => {
      if (_opts.req.headers.authorization === 'meow') {
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

  const router = trpc.router<Context>().query('hello', {
    input: z
      .object({
        who: z.string().optional(),
      })
      .optional(),
    resolve({ input, ctx }) {
      return {
        text: `hello ${input?.who ?? ctx.user?.name ?? 'world'}`,
      };
    },
  });

  // express implementation
  const app = express();
  app.use(bodyParser.json());

  app.use(
    '/trpc',
    trpc.createExpressMiddleware({
      router,
      createContext,
    }),
  );
  const { server, port } = await new Promise<{
    server: http.Server;
    port: number;
  }>((resolve) => {
    const server = app.listen(0, () => {
      resolve({
        server,
        port: (server.address() as any).port,
      });
    });
  });

  const client = createTRPCClient<typeof router>({
    url: `http://localhost:${port}/trpc`,

    fetchOpts: {
      AbortController: AbortController as any,
      fetch: fetch as any,
    },
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
