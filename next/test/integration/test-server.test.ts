import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { createTrpcClient, httpLink, routerType } from 'trpcdev/client';
import { TestServer } from 'trpcdev/internal/testing';
import { initTrpc } from 'trpcdev/server';
import { z } from 'zod';

const t = initTrpc();
const router = {
  health: t.procedure.query(() => 'ok'),
  double: t.procedure
    .input(z.object({ n: z.number() }))
    .mutation(({ input }) => input.n * 2),
};

const server = TestServer.layer({ router }).pipe(
  Layer.provide(
    NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
  ),
);

const client = Effect.gen(function* () {
  const { url } = yield* TestServer;
  return createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url })],
  });
});

it.layer(server)('TestServer (01 Q1.4)', (it) => {
  it.effect('serves the router on a free port', () =>
    Effect.gen(function* () {
      const { url, wsUrl } = yield* TestServer;
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/trpc$/);
      expect(wsUrl).toBe(url.replace(/^http/, 'ws'));
      const trpc = yield* client;
      expect(yield* Effect.promise(() => trpc.health.query())).toBe('ok');
    }),
  );

  it.effect('records the requests it receives', () =>
    Effect.gen(function* () {
      const { requests } = yield* TestServer;
      const before = requests.length;
      const trpc = yield* client;
      expect(yield* Effect.promise(() => trpc.double.mutate({ n: 21 }))).toBe(
        42,
      );
      expect(requests.slice(before)).toMatchObject([
        { method: 'POST', url: expect.stringContaining('/trpc/double') },
      ]);
    }),
  );
});
