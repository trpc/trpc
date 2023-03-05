import {
  TRPCClientError,
  createTRPCProxyClient,
  httpBatchLink,
} from '@trpc/client/src';
import { TRPCError, initTRPC } from '@trpc/server';
import {
  CreateHTTPHandlerOptions,
  createHTTPServer,
} from '@trpc/server/src/adapters/standalone';
import fetch from 'node-fetch';
import { z } from 'zod';

const t = initTRPC.create();
const router = t.router({
  hello: t.procedure
    .input(
      z.object({
        who: z.string().nullish(),
      }),
    )
    .query(({ input }) => ({
      text: `hello ${input?.who}`,
    })),
  exampleError: t.procedure.query(() => {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected error',
    });
  }),
});

let app: ReturnType<typeof createHTTPServer>;
async function startServer(opts: CreateHTTPHandlerOptions<any>) {
  app = createHTTPServer(opts);
  app.server.addListener('error', (err) => {
    throw err;
  });

  const { port } = app.listen(0);

  const client = createTRPCProxyClient<typeof router>({
    links: [
      httpBatchLink({
        url: `http://localhost:${port}`,
        AbortController,
        fetch: fetch as any,
      }),
    ],
  });

  return {
    port,
    router,
    client,
  };
}

afterEach(async () => {
  if (app) {
    app.server.close();
  }
});

test('simple query', async () => {
  const t = await startServer({
    router,
  });

  expect(
    await t.client.hello.query({
      who: 'test',
    }),
  ).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});

test('error query', async () => {
  const t = await startServer({
    router,
  });

  try {
    await t.client.exampleError.query();
  } catch (e) {
    expect(e).toStrictEqual(new TRPCClientError('Unexpected error'));
  }
});

test('middleware intercepts request', async () => {
  const t = await startServer({
    middleware: (_req, res, _next) => {
      res.statusCode = 419;
      res.end();
      return;
    },
    router,
  });

  const result = await fetch(`http://localhost:${t.port}`);

  expect(result.status).toBe(419);
});

test('middleware passes the request', async () => {
  const t = await startServer({
    middleware: (_req, _res, next) => {
      return next();
    },
    router,
  });

  const result = await t.client.hello.query({ who: 'test' });

  expect(result).toMatchInlineSnapshot(`
    Object {
      "text": "hello test",
    }
  `);
});
