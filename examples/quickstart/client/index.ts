import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server';

const trpc = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:2022',
    }),
  ],
});

async function main() {
  /**
   * Inferring types
   */
  const users = await trpc.userList.query();
  //    ^?

  const user = await trpc.userById.query('1');
  //    ^?

  const createdUser = await trpc.userCreate.mutate({ name: 'sachinraja' });
  //    ^?
}

main().catch(console.error);
