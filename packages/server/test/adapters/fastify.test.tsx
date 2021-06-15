/* eslint-disable @typescript-eslint/no-unused-vars */
import f from 'fastify';
import * as trpc from '../../../server/src';
import {
  CreateHttpContextOptions,
  createHttpHandler,
  requestHandler,
} from '../../../server/src';
import { createTRPCClient } from '@trpc/client';
import fetch from 'node-fetch';
import AbortController from 'abort-controller';
const fetchOpts = { fetch, AbortController } as any;

async function startServer() {
  const fastify = f();

  type Context = trpc.inferAsyncReturnType<typeof createContext>;

  const appRouter = trpc.router<Context>().query('hello', {
    resolve() {
      return {
        text: `hello world`,
      };
    },
  });
  type AppRouter = typeof appRouter;

  function createContext(_opts: CreateHttpContextOptions) {
    // use opts.req / opts.res here
    return {
      // req,
      // res,
    };
  }
  fastify.all('/trpc/:path', (req, reply) => {
    requestHandler({
      req: req.raw,
      res: reply.raw,
      router: appRouter,
      createContext,
      path: (req.params as any).path,
    });
  });

  const url = await fastify.listen(0);

  const client = createTRPCClient<AppRouter>({
    url: `${url}/trpc`,
    fetchOpts,
  });
  return {
    url,
    client,
    close: () => {
      return fastify.close();
    },
  };
}

let t: trpc.inferAsyncReturnType<typeof startServer>;
beforeAll(async () => {
  t = await startServer();
});
afterAll(async () => {
  // await t.close();
});

test('fastify hello query', async () => {
  const res = await t.client.query('hello');
  expect(res).toMatchInlineSnapshot(`
    Object {
      "text": "hello world",
    }
  `);
});
