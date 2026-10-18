/**
 * Runs the client against two servers on each backend, Redis then
 * Postgres, restarting one of them under its subscriptions.
 */
import { main } from './client.ts';
import { listen } from './server.ts';

for (const backend of ['redis', 'postgres'] as const) {
  console.log(`${backend}:`);
  let server = await listen(0, { backend });
  try {
    await using other = await listen(0, { backend, idleTimeoutMs: 1000 });
    const port = Number(new URL(server.url).port);
    await main(server.url, {
      other: other.url,
      restart: async (whileDown) => {
        await server[Symbol.asyncDispose]();
        await whileDown();
        server = await listen(port, { backend });
      },
    });
  } finally {
    await server[Symbol.asyncDispose]();
  }
}
