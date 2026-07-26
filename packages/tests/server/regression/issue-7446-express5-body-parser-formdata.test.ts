import type http from 'http';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC, type inferRouterOutputs } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import type { TRPCSuccessResponse } from '@trpc/server/rpc';
import express from 'express';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router({
  multipartForm: t.procedure
    .input(
      z.custom<FormData>((input) => {
        // instanceof FormData is unreliable across realms (the server-side
        // instance comes from undici), so check the toString tag instead
        return Object.prototype.toString.call(input) === '[object FormData]';
      }),
    )
    .mutation(({ input }) => {
      return { id: input.get('id') };
    }),
  helloMutation: t.procedure
    .input(z.string())
    .mutation(({ input }) => `hello ${input}`),
});

async function startServer() {
  const app = express();

  // express 5's body-parser defines `req.body` (as `undefined`) even on
  // content types it skips, e.g. multipart/form-data — the adapter must
  // still stream those bodies instead of treating them as pre-parsed
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/', trpcExpress.createExpressMiddleware({ router }));

  const { server, port } = await new Promise<{
    server: http.Server;
    port: number;
  }>((resolve, reject) => {
    const server = app.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('expected the server to listen on a TCP address'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });

  const url = `http://localhost:${port}`;
  const client = createTRPCClient<typeof router>({
    links: [
      // no fetch override: httpBatchLink defaults to the global fetch
      httpBatchLink({
        url,
      }),
    ],
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => {
          err ? reject(err) : resolve();
        }),
      ),
    client,
    url,
  };
}

let $: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  $ = await startServer();
});
afterAll(async () => {
  await $.close();
});

test('multipart/form-data body reaches the procedure', async () => {
  // the multipart body is built by hand so the test does not depend on the
  // environment's FormData/fetch pairing
  const boundary = 'trpc-issue-boundary';
  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="id"',
    '',
    'bar',
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const res = await fetch(`${$.url}/multipartForm`, {
    method: 'POST',
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  expect(res.status).toBe(200);
  const json: TRPCSuccessResponse<
    inferRouterOutputs<typeof router>['multipartForm']
  > = await res.json();
  expect(json.result.data).toEqual({ id: 'bar' });
});

test('json bodies keep working through the pre-parsed path', async () => {
  expect(await $.client.helloMutation.mutate('world')).toBe('hello world');
});
