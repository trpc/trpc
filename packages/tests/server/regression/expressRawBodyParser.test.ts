// @vitest-environment node
import type http from 'http';
import { createTRPCClient, httpBatchLink, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { octetInputParser } from '@trpc/server/http';
import express from 'express';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router({
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .mutation(({ input }) => `hello ${input.name}`),
  upload: t.procedure.input(octetInputParser).mutation(async ({ input }) => {
    const bytes: number[] = [];
    for await (const chunk of input) {
      bytes.push(...chunk);
    }
    return bytes;
  }),
});

async function startServer() {
  const app = express();

  // `express.raw()` leaves `req.body` as a Buffer of the bytes it read, e.g.
  // so a webhook route can verify a signature over the raw body
  app.use(express.raw({ type: '*/*' }));

  app.use('/', trpcExpress.createExpressMiddleware({ router }));

  const server = await new Promise<http.Server>((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected the server to listen on a TCP address');
  }
  const url = `http://localhost:${address.port}`;

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => {
          err ? reject(err) : resolve();
        }),
      ),
  };
}

let $: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  $ = await startServer();
});
afterAll(async () => {
  await $.close();
});

test('a JSON body pre-read into a Buffer reaches the procedure', async () => {
  const client = createTRPCClient<typeof router>({
    links: [httpBatchLink({ url: $.url })],
  });

  expect(await client.hello.mutate({ name: 'world' })).toBe('hello world');
});

test('a binary body pre-read into a Buffer reaches the procedure', async () => {
  const client = createTRPCClient<typeof router>({
    links: [httpLink({ url: $.url })],
  });

  const bytes = new Uint8Array([0, 1, 2, 254, 255]);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });

  expect(await client.upload.mutate(blob)).toEqual([0, 1, 2, 254, 255]);
});
