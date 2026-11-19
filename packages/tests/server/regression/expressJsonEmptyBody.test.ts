// @vitest-environment node
import type http from 'http';
import { createTRPCClient, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import express from 'express';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router({
  greet: t.procedure
    .input(z.string().optional())
    .mutation(({ input }) => `hello ${input ?? 'nobody'}`),
  echo: t.procedure.input(z.unknown()).mutation(({ input }) => ({ input })),
});

async function startServer() {
  const app = express();

  // `express.json()` sets `req.body` to `{}` for an empty body
  app.use(express.json());

  app.use('/', trpcExpress.createExpressMiddleware({ router }));

  const server = await new Promise<http.Server>((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('expected the server to listen on a TCP address');
  }
  const url = `http://localhost:${address.port}`;

  return makeAsyncResource(
    {
      client: createTRPCClient<typeof router>({
        links: [httpLink({ url })],
      }),
    },
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => {
          err ? reject(err) : resolve();
        }),
      ),
  );
}

test('a mutation called without input gets undefined', async () => {
  await using $ = await startServer();
  expect(await $.client.greet.mutate()).toBe('hello nobody');
});

test('a mutation called with input still gets it', async () => {
  await using $ = await startServer();
  expect(await $.client.echo.mutate({ name: 'world' })).toEqual({
    input: { name: 'world' },
  });
  expect(await $.client.echo.mutate({})).toEqual({ input: {} });
});
