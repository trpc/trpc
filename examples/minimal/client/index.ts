import { createTRPCProxyClient } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from '../server';

// Only needed in node
global.fetch = fetch as any;

const client = createTRPCProxyClient<AppRouter>({
  url: 'http://localhost:2022',
});

async function main() {
  const result = await client.greet.query('tRPC');

  // Type safe
  console.log(result.greeting.toUpperCase());
}

main();
