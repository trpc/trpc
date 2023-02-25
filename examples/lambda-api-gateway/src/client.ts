import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:4050' })],
});

(async () => {
  try {
    const q = await client.greet.query({ name: 'Erik' });
    console.log(q);
  } catch (error) {
    console.log('error', error);
  }
})();
