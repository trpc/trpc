/**
 * Runs `workers/server.ts` on workerd with Wrangler's `unstable_startWorker`
 * (a local KV namespace included), then the client against it.
 */
import { fileURLToPath } from 'node:url';
import { unstable_startWorker } from 'wrangler';
import { main } from '../client.ts';

export async function start() {
  const worker = await unstable_startWorker({
    config: fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
    dev: { server: { port: 0 }, inspector: false, logLevel: 'warn' },
  });
  try {
    await worker.ready;
    const url = new URL('/trpc', await worker.url).href;
    await main(url, { runtime: 'workers', websockets: false });
  } finally {
    await worker.dispose();
  }
}
