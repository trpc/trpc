import type http from 'http';
import { createTRPCClient, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router({
  ping: t.procedure.mutation(() => 'pong'),
  echo: t.procedure.input(z.string()).mutation(({ input }) => input),
});

/**
 * Mimics body parsers such as `@koa/bodyparser` without `patchNode`: the
 * request stream is drained, but nothing is assigned to `req.body`
 */
function drainBody(
  req: http.IncomingMessage,
  _res: http.ServerResponse,
  next: (err?: unknown) => void,
) {
  req.on('data', () => {
    // discard
  });
  req.on('end', () => next());
  req.on('error', next);
}

async function startServer() {
  const server = createHTTPServer({
    router,
    middleware: drainBody,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert(address && typeof address !== 'string');

  const client = createTRPCClient<typeof router>({
    links: [httpLink({ url: `http://localhost:${address.port}` })],
  });

  return {
    client,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

const TIMEOUT = Symbol('timeout');

function settleWithin(promise: Promise<unknown>, ms: number) {
  return Promise.race([
    promise.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<typeof TIMEOUT>((resolve) =>
      setTimeout(() => resolve(TIMEOUT), ms),
    ),
  ]);
}

let $: Awaited<ReturnType<typeof startServer>>;
beforeAll(async () => {
  $ = await startServer();
});
afterAll(async () => {
  await $.close();
});

test('mutation without input does not hang when the body was already read', async () => {
  const outcome = await settleWithin($.client.ping.mutate(), 2_000);
  expect(outcome).not.toBe(TIMEOUT);
});

test('mutation with input does not hang when the body was already read', async () => {
  const outcome = await settleWithin($.client.echo.mutate('hello'), 2_000);
  expect(outcome).not.toBe(TIMEOUT);
});
