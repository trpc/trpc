/**
 * The migration, stage by stage, against a server's v11 endpoint (`/trpc`):
 * v11 clients on it, then the v12 client on `/rpc` beside it, then the
 * codemod on a copy of the v11 app.
 */
import { run as serveV11Clients } from './stages/1-serve-v11-clients.ts';
import { run as moveTheClient } from './stages/2-move-the-client.ts';
import { run as codemod } from './stages/3-codemod.ts';

export async function main(url: string) {
  await serveV11Clients(url);
  await moveTheClient(new URL('/rpc', url).href);
  codemod();
}

if (import.meta.main) {
  await main(process.argv[2] ?? 'http://localhost:3000/trpc');
}
