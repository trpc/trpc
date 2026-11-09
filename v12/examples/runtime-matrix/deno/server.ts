/**
 * Deno: `Deno.serve` takes `handler.fetch`, which upgrades WebSockets with
 * `Deno.upgradeWebSocket` inside the handler's middleware, so `cors()`
 * refuses an upgrade from another origin.
 * `pnpm server:deno` serves on `PORT` (default 3000).
 */
import { createFetchHandler } from '@trpc12/trpc/server';
import { handlerOptions, Visits } from '../src/router.ts';

const handler = createFetchHandler({
  ...handlerOptions,
  layer: Visits.memory,
  createContext: () => ({
    runtime: { name: 'deno', version: Deno.version.deno },
  }),
  websocket: { upgrade: Deno.upgradeWebSocket },
});

const server = Deno.serve(
  {
    port: Number(Deno.env.get('PORT') ?? 3000),
    hostname: '127.0.0.1',
    onListen: (addr) =>
      console.log(`listening on http://${addr.hostname}:${addr.port}/trpc`),
  },
  (request) => handler.fetch(request),
);

Deno.addSignalListener('SIGTERM', () => {
  void server.shutdown().then(() => handler.dispose());
});
