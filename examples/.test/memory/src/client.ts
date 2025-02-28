import v8 from 'v8';
import {
  createTRPCClient,
  httpLink,
  unstable_httpBatchStreamLink,
} from '@trpc/client';
import type { AppRouter } from './server.js';

// Function to get heap statistics in MB
function getMemoryUsage() {
  const stats = v8.getHeapStatistics();
  return {
    totalHeapSize: stats.total_heap_size / (1024 * 1024),
    usedHeapSize: stats.used_heap_size / (1024 * 1024),
    heapSizeLimit: stats.heap_size_limit / (1024 * 1024),
  };
}

const client = createTRPCClient<AppRouter>({
  links: [httpLink({ url: 'http://localhost:3000' })],
});

await client.hello.query();
const initial = getMemoryUsage();
// Log initial memory usage
console.log('Initial memory usage:', initial);

// Track memory at intervals

const checkInterval = 10_000; // Check every 1000 iterations

for (let i = 0; i < 100_000; i++) {
  await client.hello.query();

  // Take memory snapshots at regular intervals
  if (i % checkInterval === 0) {
    console.log(`Memory at iteration ${i}:`, getMemoryUsage());
  }
}

// Log final memory usage
console.log('Final memory usage:', {
  final: getMemoryUsage(),
  initial,
});

// Optional: force garbage collection if available
if (global.gc) {
  global.gc();
  console.log('After garbage collection:', getMemoryUsage());
}
