/**
 * Serves the API on Effect's server, Express or Fastify. `pnpm server`
 * listens on `PORT` (3000) with `SERVER` (`effect`, `express` or `fastify`).
 */
import { createApiHandler } from './src/handler.ts';
import { listenEffect, listenExpress, listenFastify } from './src/servers.ts';

export type { AppRouter } from './src/router.ts';

const servers = {
  effect: listenEffect,
  express: listenExpress,
  fastify: listenFastify,
};
export type ServerKind = keyof typeof servers;
export const serverKinds = Object.keys(servers) as ServerKind[];

/** Starts a server on a fresh seed of the data; disposing stops it. */
export async function listen(port = 0, kind: ServerKind = 'effect') {
  const handler = createApiHandler();
  const server = await servers[kind](handler, port);
  return {
    url: `${server.origin}/trpc`,
    [Symbol.asyncDispose]: async () => {
      await server.close();
      await handler.dispose();
    },
  };
}

if (import.meta.main) {
  const kind = (process.env['SERVER'] ?? 'effect') as ServerKind;
  if (!serverKinds.includes(kind)) throw new Error(`SERVER: ${kind}?`);
  const server = await listen(Number(process.env['PORT'] ?? 3000), kind);
  console.log(`${kind}: ${server.url}`);
}
