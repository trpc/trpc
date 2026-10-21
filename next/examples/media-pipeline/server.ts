/**
 * One store behind two endpoints: `/trpc` with progressive JSON, batching on, and
 * `/sync` with superjson, as a v11 app would have it.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { createFetchHandler } from '@trpc12/trpc/server';
import { progressiveJson, sync } from './money.ts';
import { Photos, STEP_LATENCY } from './photos.ts';
import { appRouter } from './router.ts';

export type { AppRouter } from './router.ts';

/** Serves `/trpc` and `/sync` on `port` (a free one by default). */
export async function listen(port = 0) {
  const layer = Layer.succeed(
    Photos,
    Effect.runSync(Photos.make({ latency: STEP_LATENCY })),
  );
  const handler = createFetchHandler({
    router: appRouter,
    layer,
    transformer: progressiveJson,
    batch: true,
  });
  const syncHandler = createFetchHandler({
    router: appRouter,
    layer,
    transformer: sync,
    endpoint: '/sync',
  });
  const runtime = ManagedRuntime.make(
    HttpRouter.serve(Layer.mergeAll(handler.routes, syncHandler.routes), {
      disableLogger: true,
      disableListenLog: true,
    }).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith(Effect.succeed),
  );
  return {
    url: `${origin}/trpc`,
    [Symbol.asyncDispose]: async () => {
      await runtime.dispose();
      await Promise.all([handler.dispose(), syncHandler.dispose()]);
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(
    `media-pipeline: ${server.url} (progressive JSON), and /sync (superjson)`,
  );
  process.once('SIGINT', () => void server[Symbol.asyncDispose]());
}
