/**
 * The worker thread's entry: serves the router to its parent over
 * `parentPort`. `start.ts` starts it with `new Worker()`.
 */
import { parentPort } from 'node:worker_threads';
import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter } from './router.ts';

export type { AppRouter } from './router.ts';

if (!parentPort) {
  throw new Error('server.ts runs in a worker thread: run `pnpm start`');
}

createFetchHandler({
  router: appRouter,
  serializer: createSerializer(),
  createContext: (opts) => {
    const token = opts.info.connectionParams?.['token'];
    return {
      token: typeof token === 'string' ? token : undefined,
      transport: opts.info.transport,
    };
  },
}).messagePort(parentPort);
