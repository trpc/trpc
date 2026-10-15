import { once } from 'node:events';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Exit, Scope } from 'effect';
import { HttpEffect } from 'effect/http';
import { createTrpcClient, httpLink } from 'trpcdev/client';
import { toHttpEffect } from 'trpcdev/http';
import { createFetchHandler, initTrpc } from 'trpcdev/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();
const router = {
  hello: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `hello ${input.name}`),
  save: t.procedure
    .input(z.object({ n: z.number() }))
    .mutation(({ input }) => input.n * 2),
};
const handler = createFetchHandler({ router });

/** What `express.json()` does: read the stream, set `req.body`. */
async function jsonParser(req: IncomingMessage & { body?: unknown }) {
  let raw = '';
  req.setEncoding('utf8');
  req.on('data', (chunk: string) => (raw += chunk));
  await once(req, 'end');
  if (req.headers['content-type']?.startsWith('application/json')) {
    req.body = JSON.parse(raw);
  }
}

test('a body an Express parser already read is taken from req.body', async () => {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await Effect.runPromise(
    NodeHttpServer.makeHandler(toHttpEffect(handler), { scope }),
  );
  const server = createServer(async (req, res) => {
    await jsonParser(req);
    nodeHandler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/trpc`;
  try {
    const client = createTrpcClient<typeof router>({
      links: [httpLink({ url })],
    });
    expect(await client.save.mutate({ n: 2 })).toBe(4);

    const res = await fetch(`${url}/save`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      json: { error: { message: expect.stringMatching(/already read/) } },
    });
  } finally {
    server.closeAllConnections();
    server.close();
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test('a (req, res) handler for Express, Fastify and node:http (docs/platforms.md)', async () => {
  const scope = Scope.makeUnsafe();
  const nodeHandler = await Effect.runPromise(
    NodeHttpServer.makeHandler(toHttpEffect(handler), { scope }),
  );
  // Effect reads req.url, which app.use('/trpc', …) strips; Express routes keep it.
  const server = createServer((req, res) => nodeHandler(req, res));
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const client = createTrpcClient<typeof router>({
      links: [httpLink({ url: `http://127.0.0.1:${port}/trpc` })],
    });
    expect(await client.hello.query({ name: 'node' })).toBe('hello node');
  } finally {
    server.close();
    await Effect.runPromise(Scope.close(scope, Exit.void));
  }
});

test('a web handler from the Effect app, for fetch runtimes (docs/platforms.md)', async () => {
  const web = HttpEffect.toWebHandler(toHttpEffect(handler));
  const res = await web(new Request('http://localhost/trpc/hello?name=web'));
  expect(await res.json()).toEqual({ json: 'hello web' });
});
