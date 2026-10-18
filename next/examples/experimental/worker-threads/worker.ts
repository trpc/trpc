/**
 * The worker thread: serves `workerRouter` to its parent over `parentPort`.
 */
import { parentPort } from 'node:worker_threads';
import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler } from '@trpc12/trpc/server';
import { workerRouter } from './router.ts';

if (!parentPort) throw new Error('worker.ts runs in a worker thread');

createFetchHandler({
  router: workerRouter,
  serializer: createSerializer(),
  createContext: (opts) => {
    const token = opts.info.connectionParams?.['token'];
    return {
      token: typeof token === 'string' ? token : undefined,
      transport: opts.info.transport,
    };
  },
}).messagePort(parentPort);
