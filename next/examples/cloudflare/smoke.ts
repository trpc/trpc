/**
 * Runs the Worker locally with Wrangler (workerd), then calls a room over
 * HTTP and subscribes to it over a hibernating WebSocket. `pnpm dev` serves
 * it for a browser instead.
 */
import {
  createTrpcClient,
  httpLink,
  splitLink,
  wsLink,
  routerType,
} from 'trpcdev/client';
import { unstable_startWorker } from 'wrangler';
import type { AppRouter } from './src/router.ts';

const worker = await unstable_startWorker({
  config: new URL('./wrangler.jsonc', import.meta.url).pathname,
  dev: { server: { port: 0 }, inspector: false, logLevel: 'warn' },
});
try {
  await worker.ready;
  const url = new URL('/rooms/lobby/trpc', await worker.url).href;
  const ws = wsLink({ url: url.replace(/^http/, 'ws') });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      splitLink({
        condition: (op) => op.type === 'subscription',
        true: ws,
        false: httpLink({ url }),
      }),
    ],
  });

  console.log('room:', await client.room.query());

  const seen: string[] = [];
  const done = (async () => {
    for await (const event of client.onMessage.subscribe()) {
      seen.push(`${event.data.from}: ${event.data.text}`);
      if (seen.length === 2) return;
    }
  })();
  // The subscription is registered once its first message reaches the object.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await client.send.mutate({ from: 'ada', text: 'hello' });
  await client.send.mutate({ from: 'ada', text: 'still here' });
  await done;
  console.log('onMessage:', seen);
  if (seen.length !== 2) throw new Error('expected two messages');
  await ws.close();
} finally {
  await worker.dispose();
}
