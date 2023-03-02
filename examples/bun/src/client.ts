import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './router.js';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

const bilbo = await client.getUserById.query('id_bilbo');
// => { id: 'id_bilbo', name: 'Bilbo' };
const frodo = await client.createUser.mutate({ name: 'Frodo' });
// => { id: 'id_frodo', name: 'Frodo' };
