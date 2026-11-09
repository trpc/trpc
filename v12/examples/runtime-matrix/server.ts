/**
 * Node: `serve(handler)` on Effect's Node `HttpServer`, which also serves
 * WebSocket upgrades. The other runtimes' servers are in `bun/`, `deno/`,
 * `lambda/` and `workers/`. `pnpm server` serves on `PORT` (default 3000).
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import { serve } from '@trpc12/trpc/http';
import { createFetchHandler } from '@trpc12/trpc/server';
import { handlerOptions, Visits } from './src/router.ts';

export type { AppRouter } from './src/router.ts';

export async function listen(port = 0) {
  const handler = createFetchHandler({
    ...handlerOptions,
    layer: Visits.memory,
    createContext: () => ({
      runtime: { name: 'node', version: process.version },
    }),
  });
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const address = await runtime.runPromise(
    HttpServer.addressFormattedWith(Effect.succeed),
  );
  return {
    url: `${address}/trpc`,
    async [Symbol.asyncDispose]() {
      await runtime.dispose();
      await handler.dispose();
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(`listening on ${server.url}`);
  process.once('SIGINT', () => void server[Symbol.asyncDispose]());
}
