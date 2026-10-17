import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { TestServer } from '@trpc12/trpc/internal/testing';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const t = initTrpc();
const router = {
  health: t.procedure.query(() => 'ok'),
  double: t.procedure
    .input(z.object({ n: z.number() }))
    .mutation((opts) => opts.input.n * 2),
};

const server = TestServer.layer({ router }).pipe(
  Layer.provide(
    NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
  ),
);

const client = Effect.gen(function* () {
  const testServer = yield* TestServer;
  return createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: testServer.url })],
  });
});

it.layer(server)('TestServer (01 Q1.4)', (it) => {
  it.effect('serves the router on a free port', () =>
    Effect.gen(function* () {
      const testServer = yield* TestServer;
      expect(testServer.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/trpc$/);
      expect(testServer.wsUrl).toBe(testServer.url.replace(/^http/, 'ws'));
      const trpc = yield* client;
      expect(yield* Effect.promise(() => trpc.health.query())).toBe('ok');
    }),
  );

  it.effect('records the requests it receives', () =>
    Effect.gen(function* () {
      const testServer = yield* TestServer;
      const before = testServer.requests.length;
      const trpc = yield* client;
      expect(yield* Effect.promise(() => trpc.double.mutate({ n: 21 }))).toBe(
        42,
      );
      expect(testServer.requests.slice(before)).toMatchObject([
        { method: 'POST', url: expect.stringContaining('/trpc/double') },
      ]);
    }),
  );
});
