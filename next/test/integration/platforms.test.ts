import { createServer } from 'node:http';
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
};
const handler = createFetchHandler({ router });

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
