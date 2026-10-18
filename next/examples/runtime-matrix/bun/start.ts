/**
 * Runs each Bun server with `bun`, then the client against it:
 * `Bun.serve` (no WebSockets) and Effect's `BunHttpServer`.
 */
import { main } from '../client.ts';
import { spawnServer } from '../src/spawn-server.ts';

const servers = [
  { label: 'bun (Bun.serve)', entry: 'bun/server.ts', websockets: false },
  { label: 'bun (Effect)', entry: 'bun/effect-server.ts', websockets: true },
];

export async function start() {
  for (const { label, entry, websockets } of servers) {
    await using server = await spawnServer(label, ['bun', entry]);
    if (server) await main(server.url, { label, runtime: 'bun', websockets });
  }
}
