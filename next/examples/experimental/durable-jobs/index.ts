/**
 * Durable jobs example (experimental): two servers share Redis for kept
 * results (`experimental_durable` on `Persistence.layerBackingRedis`) and
 * locks (`experimental_lock` on `experimental_redisLocker`).
 *
 * - A payment whose response is lost is retried by `experimental_durableLink`
 *   with the same call id, and the customer is charged once.
 * - Two payments for one invoice, on different servers, run one at a time.
 * - A report whose stream is cut on one server resumes on the other.
 *
 * Needs Redis: `REDIS_URL`, or `redis://127.0.0.1:6379`. Run with `node index.ts`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRedis } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import { Persistence } from 'effect/persistence';
import {
  createTrpcClient,
  experimental_durableLink,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';
import { serve } from '@trpc12/trpc/http';
import {
  experimental_durable,
  experimental_lock,
  experimental_redisLocker,
} from '@trpc12/trpc/middleware';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The app's database. Both servers run in this process, so they share it. */
const db = { charges: new Map<string, number>(), reportRuns: 0 };

const t = initTrpc();
const appRouter = {
  invoice: {
    pay: t.procedure
      .input(z.object({ invoice: z.string() }))
      // A retry with the same call id gets the kept result, from either server.
      .use(experimental_durable())
      // Payments with different call ids for one invoice never overlap.
      .use(
        experimental_lock<{ input: { invoice: string } }>({
          key: (opts) => `invoice:${opts.input.invoice}`,
        }),
      )
      .mutation(async (opts) => {
        const charges = db.charges.get(opts.input.invoice) ?? 0;
        if (charges > 0) {
          return { status: 'already paid', waited: opts.ctx.lock.waited };
        }
        await sleep(100); // the payment provider
        db.charges.set(opts.input.invoice, charges + 1);
        return { status: 'paid', waited: opts.ctx.lock.waited };
      }),
  },
  report: {
    build: t.procedure
      .input(z.object({ name: z.string() }))
      .use(experimental_durable({ ttl: '1 hour' }))
      .mutation((opts) => {
        db.reportRuns++;
        return {
          name: opts.input.name,
          rows: (async function* () {
            for (let row = 1; row <= 5; row++) {
              await sleep(20);
              yield { row, total: row * 100 };
            }
          })(),
          summary: sleep(150).then(() => ({ rows: 5 })),
        };
      }),
  },
};
export type AppRouter = typeof appRouter;

const RedisLive = NodeRedis.layer({
  url: process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
});
const StoresLive = Layer.mergeAll(
  Persistence.layerBackingRedis,
  experimental_redisLocker(),
).pipe(Layer.provide(RedisLive));

/** One server process; run as many as you like against the same Redis. */
async function startServer() {
  const handler = createFetchHandler({ router: appRouter, layer: StoresLive });
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port: 0, host: '127.0.0.1' }),
      ),
    ),
  );
  const url = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url: `${url}/trpc`,
    async close() {
      await runtime.dispose();
      await handler.dispose();
    },
  };
}

const connect = (url: string, fetch: typeof globalThis.fetch) =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [experimental_durableLink(), httpLink({ url, fetch })],
  });

const a = await startServer();
const b = await startServer();
const run = Date.now();

// --- a lost response --------------------------------------------------------

const sentIds: Array<string | null> = [];
let dropNext = true;
const flaky = connect(a.url, async (url, init) => {
  sentIds.push(new Headers(init?.headers).get('trpc-call-id'));
  const res = await fetch(url, init);
  if (dropNext) {
    // The server answered, but the answer never arrives.
    dropNext = false;
    await res.body?.cancel();
    throw new TypeError('fetch failed');
  }
  return res;
});
const paid = await flaky.invoice.pay.mutate({ invoice: `inv-${run}-1` });
console.log('lost response, retried:', paid, 'call ids', sentIds);
if (paid.status !== 'paid')
  throw new Error(`expected paid, got ${paid.status}`);
if (sentIds.length !== 2 || sentIds[0] === null || sentIds[0] !== sentIds[1]) {
  throw new Error(`expected one retry with the same call id: ${sentIds}`);
}
if (db.charges.get(`inv-${run}-1`) !== 1) throw new Error('charged twice');

// --- one invoice, two servers -----------------------------------------------

const onA = connect(a.url, fetch);
const onB = connect(b.url, fetch);
const invoice = `inv-${run}-2`;
const both = await Promise.all([
  onA.invoice.pay.mutate({ invoice }),
  sleep(20).then(() => onB.invoice.pay.mutate({ invoice })),
]);
console.log('same invoice on A and B:', both);
if (both[0].status !== 'paid' || both[1].status !== 'already paid') {
  throw new Error(`unexpected results: ${JSON.stringify(both)}`);
}
if (!both[1].waited) throw new Error('the second payment should have waited');
if (db.charges.get(invoice) !== 1) throw new Error('charged twice');

// --- a stream cut mid-way, resumed on the other server ----------------------

/** `res` with its JSON Lines body cut after `lines` lines, like a dropped connection. */
function cutAfter(res: Response, lines: number): Response {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffered = '';
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (true) {
        const newline = buffered.indexOf('\n');
        if (newline !== -1) {
          if (sent === lines) {
            await reader.cancel();
            return controller.error(new TypeError('network connection lost'));
          }
          sent++;
          controller.enqueue(encoder.encode(buffered.slice(0, newline + 1)));
          buffered = buffered.slice(newline + 1);
          return;
        }
        const chunk = await reader.read();
        if (chunk.done) return controller.close();
        buffered += decoder.decode(chunk.value, { stream: true });
      }
    },
  });
  return new Response(body, { status: res.status, headers: res.headers });
}

const resumedFrom: Array<string | null> = [];
// A load balancer that loses A mid-response and sends the retry to B.
const failover = connect(a.url, async (url, init) => {
  resumedFrom.push(new Headers(init?.headers).get('trpc-resume-from'));
  if (resumedFrom.length === 1) return cutAfter(await fetch(url, init), 3);
  return fetch(String(url).replace(a.url, b.url), init);
});
const report = await failover.report.build.mutate({ name: 'october' });
const rows: Array<{ row: number; total: number }> = [];
for await (const row of report.rows) rows.push(row);
const summary = await report.summary;
console.log('report rows', rows.map((r) => r.row).join(','), summary, {
  resumedFrom,
});
if (rows.length !== 5 || summary.rows !== 5) throw new Error('rows missing');
if (resumedFrom.join() !== ',3') {
  throw new Error(`expected a resume from frame 3: ${resumedFrom}`);
}
if (db.reportRuns !== 1) throw new Error('the report ran twice');

await Promise.all([a.close(), b.close()]);
