/**
 * Runs the migration's stages against one server. Run with `pnpm example`
 * from `next/`, or `pnpm smoke` here.
 */
import { startServer } from './server/server.ts';
import { run as serveV11Clients } from './stages/1-serve-v11-clients.ts';

const server = await startServer();
try {
  await serveV11Clients(server.origin);
} finally {
  await server.close();
}
