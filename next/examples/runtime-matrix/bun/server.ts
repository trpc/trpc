/**
 * Bun: `Bun.serve` takes `handler.fetch` as it is. Bun's server WebSockets
 * aren't web-standard, so this one serves HTTP and SSE only;
 * `effect-server.ts` adds WebSockets. `pnpm server:bun` serves on `PORT`
 * (default 3000).
 */
import { createFetchHandler } from '@trpc12/trpc/server';
import { handlerOptions, Visits } from '../src/router.ts';

const handler = createFetchHandler({
  ...handlerOptions,
  layer: Visits.memory,
  createContext: () => ({
    runtime: { name: 'bun', version: Bun.version },
  }),
});

const server = Bun.serve({
  port: Number(process.env['PORT'] ?? 3000),
  hostname: '127.0.0.1',
  fetch: (request) => handler.fetch(request),
});
console.log(`listening on ${server.url.origin}/trpc`);

process.on('SIGTERM', () => {
  void server.stop().then(() => handler.dispose());
});
