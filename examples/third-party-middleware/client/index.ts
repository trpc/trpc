import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';
import './polyfill';

const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});

async function main() {
  /**
   * Inferring types
   */
  const users = await trpc.userList.query();
  //    ^?
  console.log('Users:', users);
}

main().catch(console.error);
