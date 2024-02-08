import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/index.js';

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});

/**
 * Inferring types
 */
const users = await trpc.userList.query();
//    ^?
console.log('Users:', users);

const createdUser = await trpc.userCreate.mutate({ name: 'sachinraja' });
//    ^?
console.log('Created user:', createdUser);

const user = await trpc.userById.query('1');
//    ^?
console.log('User 1:', user);
