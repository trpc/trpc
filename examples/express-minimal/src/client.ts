import { createTRPCClient, createTRPCClientProxy } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from './router';

// polyfill
global.fetch = fetch as any;

async function main() {
  const client = createTRPCClient<AppRouter>({
    url: 'http://localhost:3000/trpc',
  });
  const proxy = createTRPCClientProxy(client);

  const withoutInputQuery = await proxy.hello.greeting.query();
  console.log(withoutInputQuery);

  const withInputQuery = await proxy.hello.greeting.query({ name: 'Alex' });
  console.log(withInputQuery);
}

main();
