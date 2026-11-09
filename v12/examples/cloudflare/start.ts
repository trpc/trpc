/** Runs `server.ts` on workerd through Wrangler and calls it with `client.ts`. */
import { unstable_startWorker } from 'wrangler';
import { main } from './client.ts';

const worker = await unstable_startWorker({
  config: new URL('./wrangler.jsonc', import.meta.url).pathname,
  dev: { server: { port: 0 }, inspector: false, logLevel: 'warn' },
});
try {
  await worker.ready;
  await main((await worker.url).href);
} finally {
  await worker.dispose();
}
