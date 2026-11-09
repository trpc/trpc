/**
 * The router the worker serves. The main thread imports only its type.
 */
import { threadId } from 'node:worker_threads';
import { initTrpc, tracked } from '@trpc12/trpc/server';
import { z } from 'zod';

const t = initTrpc<{
  ctx: { token: string | undefined; transport: string };
}>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Primes below `n`, by trial division: slow on purpose. */
function countPrimes(n: number) {
  let count = 0;
  for (let i = 2; i < n; i++) {
    let prime = true;
    for (let d = 2; d * d <= i; d++) {
      if (i % d === 0) {
        prime = false;
        break;
      }
    }
    if (prime) count++;
  }
  return count;
}

const stats = { cancelled: 0 };

export const appRouter = t.router({
  whoami: t.procedure.query((opts) => ({
    threadId,
    token: opts.ctx.token,
    transport: opts.ctx.transport,
  })),
  primes: t.procedure
    .input(z.object({ below: z.number().int().positive().max(10_000_000) }))
    .query((opts) => countPrimes(opts.input.below)),
  /** A `Date` now, a `File` once it's built: progressive JSON on both ends. */
  export: t.procedure
    .input(z.object({ rows: z.number().int().positive() }))
    .query((opts) => ({
      startedAt: new Date(),
      file: sleep(20).then(() => {
        const lines = Array.from(
          { length: opts.input.rows },
          (_, i) => `${i + 1},${(i + 1) ** 2}`,
        );
        return new File([`n,square\n${lines.join('\n')}\n`], 'squares.csv', {
          type: 'text/csv',
        });
      }),
    })),
  progress: t.procedure.subscription(async function* (opts) {
    opts.signal?.addEventListener('abort', () => stats.cancelled++);
    for (let percent = 10; percent <= 100; percent += 10) {
      await sleep(5);
      yield tracked(String(percent), { percent });
    }
  }),
  stats: t.procedure.query(() => stats),
});
export type AppRouter = typeof appRouter;
