/**
 * Node: `serve(handler)` on Effect's Node `HttpServer`, which also serves
 * WebSocket upgrades. `PORT=3000 node src/node.ts`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { HttpServer } from 'effect/http';
import { serve } from '@trpc12/trpc/http';
import { createFetchHandler } from '@trpc12/trpc/server';
import { handlerOptions, Visits } from './router.ts';

const handler = createFetchHandler({
  ...handlerOptions,
  layer: Visits.memory,
  createContext: () => ({
    runtime: { name: 'node', version: process.version },
  }),
});

const listening = Layer.effectDiscard(
  HttpServer.addressFormattedWith((url) =>
    Effect.log(`listening on ${url}/trpc`),
  ),
);

listening.pipe(
  Layer.provideMerge(serve(handler)),
  Layer.provide(
    NodeHttpServer.layer(createServer, {
      port: Number(process.env['PORT'] ?? 3000),
      host: '127.0.0.1',
    }),
  ),
  Layer.launch,
  Effect.ensuring(Effect.promise(() => handler.dispose())),
  NodeRuntime.runMain,
);
