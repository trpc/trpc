/**
 * Servers that share Redis for kept results (`experimental_durable` on
 * `Persistence.layerBackingRedis`) and locks (`experimental_lock` on
 * `experimental_redisLocker`). Run as many as you like against one Redis.
 *
 * Needs Redis: `REDIS_URL`, or `redis://127.0.0.1:6379`.
 */
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRedis } from '@effect/platform-node';
import { Effect, Layer, ManagedRuntime } from 'effect';
import { HttpServer } from 'effect/http';
import { Persistence } from 'effect/persistence';
import { serve } from '@trpc12/trpc/http';
import {
  experimental_durable,
  experimental_lock,
  experimental_redisLocker,
} from '@trpc12/trpc/middleware';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The app's database. Servers started in one process share it. */
const db = { charges: new Map<string, number>(), reportRuns: 0 };

const t = initTrpc();
const appRouter = t.router({
  invoice: {
    pay: t.procedure
      .input(z.object({ invoice: z.string() }))
      // A retry with the same call id gets the kept result, from any server.
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
    charges: t.procedure
      .input(z.object({ invoice: z.string() }))
      .query((opts) => db.charges.get(opts.input.invoice) ?? 0),
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
    runs: t.procedure.query(() => db.reportRuns),
  },
});
export type AppRouter = typeof appRouter;

const RedisLive = NodeRedis.layer({
  url: process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6379',
});
const StoresLive = Layer.mergeAll(
  Persistence.layerBackingRedis,
  experimental_redisLocker(),
).pipe(Layer.provide(RedisLive));

export async function listen(port = 0) {
  const handler = createFetchHandler({ router: appRouter, layer: StoresLive });
  const runtime = ManagedRuntime.make(
    serve(handler).pipe(
      Layer.provideMerge(
        NodeHttpServer.layer(createServer, { port, host: '127.0.0.1' }),
      ),
    ),
  );
  const origin = await runtime.runPromise(
    HttpServer.addressFormattedWith((address) => Effect.succeed(address)),
  );
  return {
    url: `${origin}/trpc`,
    async [Symbol.asyncDispose]() {
      await runtime.dispose();
      await handler.dispose();
    },
  };
}

if (import.meta.main) {
  const server = await listen(Number(process.env['PORT'] ?? 3000));
  console.log(`listening on ${server.url}`);
}
