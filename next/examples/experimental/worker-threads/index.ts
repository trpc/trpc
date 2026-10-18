/**
 * Worker threads example (experimental): a tRPC server in a `worker_threads`
 * Worker, called from the main thread with `experimental_messagePortLink`.
 * CPU-heavy work runs off the main thread, which keeps ticking meanwhile;
 * subscriptions, deferred values and files cross the port as they do over a
 * WebSocket. Run with `node index.ts`.
 */
import { threadId, Worker } from 'node:worker_threads';
import {
  createTrpcClient,
  experimental_messagePortLink,
  routerType,
} from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';
import type { WorkerRouter } from './router.ts';

const worker = new Worker(new URL('./worker.ts', import.meta.url));
const client = createTrpcClient({
  router: routerType<WorkerRouter>(),
  links: [
    experimental_messagePortLink({
      port: worker,
      serializer: createSerializer(),
      connectionParams: { token: 'main-thread' },
    }),
  ],
});

// --- who answers --------------------------------------------------------------

const who = await client.whoami.query();
console.log('main thread', threadId, 'called', who);
if (who.threadId === threadId) throw new Error('expected another thread');
if (who.token !== 'main-thread' || who.transport !== 'messagePort') {
  throw new Error(`unexpected context: ${JSON.stringify(who)}`);
}

// --- CPU work off the main thread ---------------------------------------------

let ticks = 0;
const ticker = setInterval(() => ticks++, 5);
const started = performance.now();
const primes = await client.primes.query({ below: 2_000_000 });
const took = Math.round(performance.now() - started);
clearInterval(ticker);
console.log(
  `${primes} primes below 2,000,000 in ${took}ms; main ticked ${ticks}x`,
);
if (primes !== 148_933) throw new Error(`wrong prime count: ${primes}`);
if (ticks < 5) throw new Error('the main thread was blocked');

// --- deferred values and files -------------------------------------------------

const exported = await client.export.query({ rows: 3 });
const file = await exported.file;
const csv = await file.text();
console.log('export started', exported.startedAt.toISOString(), file.name);
if (!(exported.startedAt instanceof Date)) throw new Error('expected a Date');
if (file.name !== 'squares.csv' || csv !== 'n,square\n1,1\n2,4\n3,9\n') {
  throw new Error(`unexpected file: ${file.name} ${JSON.stringify(csv)}`);
}

// --- a subscription, left early -------------------------------------------------

const seen: number[] = [];
for await (const event of client.progress.subscribe()) {
  seen.push(event.data.percent);
  if (event.data.percent === 30) break;
}
console.log('progress', seen.join(', '), 'then stopped listening');
if (seen.join() !== '10,20,30')
  throw new Error(`unexpected events: ${seen.join()}`);
const until = async (check: () => Promise<boolean>) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('timed out');
};
await until(async () => (await client.stats.query()).cancelled === 1);
console.log('the worker saw the subscription end');

await worker.terminate();
