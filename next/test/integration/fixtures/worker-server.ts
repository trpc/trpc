/**
 * A tRPC server inside a `worker_threads` Worker, serving its parent over
 * the worker's `parentPort`.
 */
import { parentPort, threadId } from 'node:worker_threads';
import { createFetchHandler, error, initTrpc, tracked } from 'trpcdev/server';
import { z } from 'zod';

const t = initTrpc<{ ctx: { token: string | undefined; transport: string } }>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const workerRouter = {
  thread: t.procedure.query(({ ctx }) => ({
    threadId,
    token: ctx.token,
    transport: ctx.transport,
  })),
  fib: t.procedure
    .input(z.object({ n: z.number().int().max(40) }))
    .query(({ input }) => {
      const fib = (n: number): number => (n < 2 ? n : fib(n - 1) + fib(n - 2));
      return fib(input.n);
    }),
  fail: t.procedure.query(() =>
    error({ code: 'FORBIDDEN', data: { why: 'no' } }),
  ),
  slowly: t.procedure.query(() => ({
    ready: true,
    later: sleep(10).then(() => new Date(1000)),
  })),
  progress: t.procedure.subscription(async function* () {
    for (let i = 1; i <= 3; i++) {
      await sleep(2);
      yield tracked(String(i), { percent: i * 33 });
    }
  }),
};
export type WorkerRouter = typeof workerRouter;

if (parentPort) {
  createFetchHandler({
    router: workerRouter,
    createContext: ({ info }) => ({
      token: info.connectionParams?.['token'] as string | undefined,
      transport: info.transport,
    }),
  }).messagePort(parentPort);
}
