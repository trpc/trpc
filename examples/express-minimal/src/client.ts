import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './router';

async function main() {
  const client = createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://localhost:3000/trpc',
      }),
    ],
  });

  const withoutInputQuery = await client.hello.greeting.query();
  console.log(withoutInputQuery);

  const withInputQuery = await client.hello.greeting.query({ name: 'Alex' });
  console.log(withInputQuery);
}

void main();
