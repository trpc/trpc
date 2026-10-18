/**
 * Bun with WebSockets: `serve(handler)` on Effect's Bun `HttpServer` from
 * `@effect/platform-bun`. `pnpm server:bun-effect` serves on `PORT`
 * (default 3000).
 */
import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Effect, Layer } from 'effect';
import { HttpServer } from 'effect/http';
import { serve } from '@trpc12/trpc/http';
import { createFetchHandler } from '@trpc12/trpc/server';
import { handlerOptions, Visits } from '../src/router.ts';

const handler = createFetchHandler({
  ...handlerOptions,
  layer: Visits.memory,
  createContext: () => ({
    runtime: { name: 'bun', version: Bun.version },
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
    BunHttpServer.layer({
      port: Number(process.env['PORT'] ?? 3000),
      hostname: '127.0.0.1',
    }),
  ),
  Layer.launch,
  Effect.ensuring(Effect.promise(() => handler.dispose())),
  BunRuntime.runMain,
);
