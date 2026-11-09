import { NodeHttpServer } from '@effect/platform-node';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { Effect, Exit, Scope } from 'effect';
import { toHttpEffect } from '@trpc12/trpc/http';
import { defineConfig, type Connect, type Plugin } from 'vite-plus';

/**
 * Serves both APIs from Vite's own server in `vp dev` and `vp preview`,
 * through `NodeHttpServer.makeHandler` (the `node:http` mount). The server
 * modules load on first use, so `vp build` never starts them.
 */
function api(): Plugin {
  const mount = async (
    middlewares: Connect.Server,
    httpServer: {
      once: (event: 'close', listener: () => void) => unknown;
    } | null,
  ) => {
    const handlers = await import('./server/api.ts');
    const scope = Scope.makeUnsafe();
    const [tracker, directory] = await Effect.runPromise(
      Effect.all([
        NodeHttpServer.makeHandler(toHttpEffect(handlers.tracker), { scope }),
        NodeHttpServer.makeHandler(toHttpEffect(handlers.directory), {
          scope,
        }),
      ]),
    );
    httpServer?.once('close', () => {
      void Effect.runPromise(Scope.close(scope, Exit.void));
    });
    middlewares.use((req, res, next) => {
      if (req.url?.startsWith('/trpc')) return tracker(req, res);
      if (req.url?.startsWith('/directory/trpc')) return directory(req, res);
      next();
    });
  };
  return {
    name: 'react-spa:api',
    configureServer: (server) => mount(server.middlewares, server.httpServer),
    configurePreviewServer: (server) =>
      mount(server.middlewares, server.httpServer),
  };
}

export default defineConfig({
  plugins: [tailwindcss(), react(), api()],
});
