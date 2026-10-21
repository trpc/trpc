/**
 * Calls the worker from the main thread with `experimental_messagePortLink`.
 * CPU-heavy work runs off the main thread, which keeps ticking meanwhile;
 * subscriptions, deferred values and files cross the port as they do over a
 * WebSocket. `main` takes the port (here, the `Worker`) instead of a URL.
 */
import assert from 'node:assert/strict';
import { threadId } from 'node:worker_threads';
import {
  createTrpcClient,
  experimental_messagePortLink,
  routerType,
  type MessagePortLike,
} from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/transformer';
import type { AppRouter } from './server.ts';

export async function main(port: MessagePortLike) {
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      experimental_messagePortLink({
        port,
        transformer: createSerializer(),
        connectionParams: { token: 'main-thread' },
      }),
    ],
  });

  // --- who answers ------------------------------------------------------------

  const who = await client.whoami.query();
  console.log('main thread', threadId, 'called', who);
  assert.notEqual(who.threadId, threadId);
  assert.equal(who.token, 'main-thread');
  assert.equal(who.transport, 'messagePort');

  // --- CPU work off the main thread -------------------------------------------

  let ticks = 0;
  const ticker = setInterval(() => ticks++, 5);
  const started = performance.now();
  const primes = await client.primes.query({ below: 2_000_000 });
  const took = Math.round(performance.now() - started);
  clearInterval(ticker);
  console.log(
    `${primes} primes below 2,000,000 in ${took}ms; main ticked ${ticks}x`,
  );
  assert.equal(primes, 148_933);
  assert.ok(ticks >= 5, 'the main thread was blocked');

  // --- deferred values and files ----------------------------------------------

  const exported = await client.export.query({ rows: 3 });
  const file = await exported.file;
  console.log('export started', exported.startedAt.toISOString(), file.name);
  assert.ok(exported.startedAt instanceof Date);
  assert.equal(file.name, 'squares.csv');
  assert.equal(await file.text(), 'n,square\n1,1\n2,4\n3,9\n');

  // --- a subscription, left early ---------------------------------------------

  const seen: number[] = [];
  for await (const event of client.progress.subscribe()) {
    seen.push(event.data.percent);
    if (event.data.percent === 30) break;
  }
  console.log('progress', seen.join(', '), 'then stopped listening');
  assert.deepEqual(seen, [10, 20, 30]);
  for (let i = 0; (await client.stats.query()).cancelled !== 1; i++) {
    assert.ok(i < 100, 'the worker never saw the subscription end');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  console.log('the worker saw the subscription end');
}
