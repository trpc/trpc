import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import fetch from 'node-fetch';
import type { AppRouter } from './server';

global.fetch = fetch as any;

const client = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://127.0.0.1:4050' })],
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
