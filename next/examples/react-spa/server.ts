/**
 * Both APIs and the built app (`vp build` writes `dist/`) on Effect's Node
 * `HttpServer`: the tracker at `/trpc`, the directory at `/directory/trpc`,
 * and the app at `/`. `pnpm start` builds and runs it on `PORT` (default
 * 3000); `pnpm dev` serves the same APIs inside Vite's dev server instead
 * (`vite.config.ts`).
 */
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpRouter, HttpServer, HttpStaticServer } from 'effect/http';
import { apiRoutes, directory, tracker } from './server/api.ts';

export type { TrackerRouter as AppRouter } from './server/tracker.ts';
export type { DirectoryRouter } from './server/directory.ts';

const dist = new URL('dist', import.meta.url).pathname;

const app = (port: number) =>
  HttpRouter.serve(
    Layer.mergeAll(
      apiRoutes,
      // Unknown paths that ask for HTML get `index.html`.
      HttpStaticServer.layer({ root: dist, spa: true }),
    ),
    { disableLogger: true, disableListenLog: true },
  ).pipe(
    Layer.provideMerge(
      NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
    ),
  );

/** `url` is the tracker's endpoint; the app is served from its origin. */
export async function listen(port = 0) {
  const runtime = ManagedRuntime.make(app(port));
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url: `${origin}/trpc`,
    [Symbol.asyncDispose]: async () => {
      await runtime.dispose();
      await tracker.dispose();
      await directory.dispose();
    },
  };
}

if (import.meta.main) {
  const port = Number(process.env['PORT'] ?? 3000);
  console.log(`react-spa on http://127.0.0.1:${port}`);
  app(port).pipe(Layer.launch, NodeRuntime.runMain);
}
