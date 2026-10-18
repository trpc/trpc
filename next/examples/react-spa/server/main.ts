/**
 * The production server: both APIs and the built app (`vp build` writes
 * `dist/`) on Effect's Node `HttpServer`. `pnpm start` runs it on port 3000;
 * `pnpm dev` serves the APIs inside Vite's dev server instead
 * (`vite.config.ts`).
 */
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpRouter, HttpServer, HttpStaticServer } from 'effect/http';
import { apiRoutes, directory, tracker } from './api.ts';

const dist = new URL('../dist', import.meta.url).pathname;

const app = (opts: { port: number; host?: string }) =>
  HttpRouter.serve(
    Layer.mergeAll(
      apiRoutes,
      // Unknown paths that ask for HTML get `index.html`.
      HttpStaticServer.layer({ root: dist, spa: true }),
    ),
    { disableLogger: true, disableListenLog: true },
  ).pipe(
    Layer.provideMerge(
      NodeHttpServer.layer(createServer, {
        port: opts.port,
        host: opts.host ?? '127.0.0.1',
      }),
    ),
  );

/** Starts the server for a test; `dispose()` stops it. */
export async function startServer(opts: { port: number }) {
  const runtime = ManagedRuntime.make(app(opts));
  const url = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url,
    dispose: async () => {
      await runtime.dispose();
      await tracker.dispose();
      await directory.dispose();
    },
  };
}

if (import.meta.main) {
  const port = Number(process.env['PORT'] ?? 3000);
  console.log(`react-spa on http://127.0.0.1:${port}`);
  app({ port }).pipe(Layer.launch, NodeRuntime.runMain);
}
