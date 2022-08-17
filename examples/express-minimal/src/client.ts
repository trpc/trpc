import { createTRPCProxyClient } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from './router';

// polyfill
global.fetch = fetch as any;

async function main() {
  const proxy = createTRPCProxyClient<AppRouter>({
    url: 'http://localhost:3000/trpc',
  });
  const ac = new AbortController();
  const signal = ac.signal;

  const withoutInputQuery = await proxy.hello.greeting.query();
  console.log(withoutInputQuery);

  const withInputQuery = await proxy.hello.greeting.query(
    { name: 'Alex' },
    { signal },
  );
  console.log(withInputQuery);

  const mutation = await proxy.hello.addTodo.mutate('hello', { signal });
  console.log(mutation);
}

main();
