/**
 * Deno: `Deno.serve` takes `handler.fetch`, and Deno's web-standard
 * `WebSocket` goes to `handler.websocket`.
 * `PORT=3000 deno run --no-lock --allow-net --allow-env --allow-read src/deno.ts`.
 */
import { createFetchHandler } from '@trpc12/trpc/server';
import { allowedOrigin, handlerOptions, Visits } from './router.ts';

const handler = createFetchHandler({
  ...handlerOptions,
  layer: Visits.memory,
  createContext: () => ({
    runtime: { name: 'deno', version: Deno.version.deno },
  }),
});

const server = Deno.serve(
  {
    port: Number(Deno.env.get('PORT') ?? 3000),
    hostname: '127.0.0.1',
    onListen: (addr) =>
      console.log(`listening on http://${addr.hostname}:${addr.port}/trpc`),
  },
  (request) => {
    if (request.headers.get('upgrade') !== 'websocket') {
      return handler.fetch(request);
    }
    // `cors()` wraps `handler.fetch`, but this upgrade never reaches it.
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== allowedOrigin) {
      return new Response(null, { status: 403 });
    }
    const upgrade = Deno.upgradeWebSocket(request);
    handler.websocket(upgrade.socket, { request });
    return upgrade.response;
  },
);

Deno.addSignalListener('SIGTERM', () => {
  void server.shutdown().then(() => handler.dispose());
});
