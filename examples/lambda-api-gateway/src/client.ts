import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:4050' })],
});

void (async () => {
  try {
    const q = await client.greet.query({ name: 'Erik' });
    console.log(q);
  } catch (error) {
    console.log('error', error);
  }
})();
