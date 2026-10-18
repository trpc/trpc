/**
 * One store behind two endpoints: `/trpc` with danSON, batching on, and
 * `/sync` with superjson, as a v11 app would have it.
 */
import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { createFetchHandler } from '@trpc12/trpc/server';
import { danson, sync } from './money.ts';
import { Photos } from './photos.ts';
import { appRouter } from './router.ts';

export function createMediaServer(opts: { latency: number; port?: number }) {
  const layer = Layer.succeed(
    Photos,
    Effect.runSync(Photos.make({ latency: opts.latency })),
  );
  const handler = createFetchHandler({
    router: appRouter,
    layer,
    serializer: danson,
    batch: true,
  });
  const syncHandler = createFetchHandler({
    router: appRouter,
    layer,
    serializer: sync,
    endpoint: '/sync',
  });
  return {
    layer: HttpRouter.serve(
      Layer.mergeAll(handler.routes, syncHandler.routes),
      {
        disableLogger: true,
        disableListenLog: true,
      },
    ).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, {
          port: opts.port ?? 0,
          host: '127.0.0.1',
        }),
      ),
    ),
    dispose: () => Promise.all([handler.dispose(), syncHandler.dispose()]),
  };
}
