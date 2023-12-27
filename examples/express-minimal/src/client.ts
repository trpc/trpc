import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './router';

async function main() {
  const client = createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: 'http://localhost:3000/trpc',
      }),
    ],
  });

  try {
    const withoutInputQuery = await client.hello.greeting.query();
    console.log(withoutInputQuery);

    const withInputQuery = await client.hello.greeting.query({ name: 'Alex' });
    console.log(withInputQuery);
  } catch (error) {
    console.error('Error:', error);
  }
}

void main();
