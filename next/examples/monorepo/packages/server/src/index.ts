import { createServer } from 'node:http';
import { NodeHttpServer } from '@effect/platform-node';
import { appRouter } from '@acme/api';
import { serve } from '@trpc12/trpc/http';
import { createFetchHandler } from '@trpc12/trpc/server';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';

export interface Server {
  url: string;
  close: () => Promise<void>;
}

/** Serves the app router on `port` (0 picks a free one). */
export async function startServer(port: number): Promise<Server> {
  const handler = createFetchHandler({
    router: appRouter,
    batch: true,
    createContext: (opts) => ({
      user: opts.request.headers['authorization'] ?? null,
    }),
  });
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const url = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url: `${url}/trpc`,
    close: async () => {
      await runtime.dispose();
      await handler.dispose();
    },
  };
}
