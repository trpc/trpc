import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:4050' })],
  namespaceDelimiter: '/',
});

(async () => {
  try {
    const q = await client.greet.query({ name: 'Erik' });
    console.log(q);
    const m = await client.admin.dropTableUsers.mutate({ doIt: true });
    console.log(m);
  } catch (error) {
    console.log('error', error);
  }
})();
