import type http from 'http';
import { createTRPCClient, httpLink, TRPCClientError } from '@trpc/client';
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

function settleWithin<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms),
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

test('mutation without input still resolves when the body was already read', async () => {
  await expect(settleWithin($.client.ping.mutate(), 2_000)).resolves.toBe(
    'pong',
  );
});

test('mutation with input rejects instead of hanging when the body was already read', async () => {
  const err = await settleWithin($.client.echo.mutate('hello'), 2_000).catch(
    (cause: unknown) => cause,
  );
  assert(err instanceof TRPCClientError);
  expect(err.data?.code).toBe('INTERNAL_SERVER_ERROR');
  expect(err.message).toMatchInlineSnapshot(
    `"The request body has already been read by another middleware. Assign the parsed body to \`req.body\` so tRPC can use it"`,
  );
});
