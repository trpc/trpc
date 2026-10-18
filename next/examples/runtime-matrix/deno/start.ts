/** Runs `deno/server.ts` with `deno run`, then the client against it. */
import { main } from '../client.ts';
import { spawnServer } from '../src/spawn-server.ts';

export async function start() {
  await using server = await spawnServer('deno', [
    'deno',
    'run',
    '--no-lock',
    '--allow-net',
    '--allow-env',
    '--allow-read',
    'deno/server.ts',
  ]);
  if (server) await main(server.url, { runtime: 'deno' });
}
