import v8 from 'v8';
import { initTRPC } from '@trpc/server';
import * as standalone from '@trpc/server/adapters/standalone';

const t = initTRPC.create();

// Function to get heap statistics in MB
function getMemoryUsage() {
  const stats = v8.getHeapStatistics();
  return {
    totalHeapSize: stats.total_heap_size / (1024 * 1024),
    usedHeapSize: stats.used_heap_size / (1024 * 1024),
    heapSizeLimit: stats.heap_size_limit / (1024 * 1024),
  };
}

let index = 0;
let initial: ReturnType<typeof getMemoryUsage>;

const checkInterval = 10_000;
const router = t.router({
  hello: t.procedure.query(() => {
    if (index === 0) {
      initial = getMemoryUsage();
    }
    index++;
    if (index % checkInterval === 0) {
      console.log('Memory usage:', getMemoryUsage());
    }
    return 'Hello, world!';
  }),
});

export const appRouter = router;

export type AppRouter = typeof appRouter;

standalone
  .createHTTPServer({
    router: appRouter,
    createContext: () => ({}),
  })
  .listen(3000);
