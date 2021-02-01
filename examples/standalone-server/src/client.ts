import { createTRPCClient } from '@trpc/client';
import AbortController from 'abort-controller';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

// polyfill fetch
global.AbortController = AbortController;
global.fetch = fetch as any;

async function main() {
  // Client solely inferred by AppRouter's **types**
  const client = createTRPCClient<AppRouter>({
    url: `http://localhost:2022`,
  });

  const res = await client.query('hello', {
    name: 'world',
  });

  console.log('res', res);
}

main();
