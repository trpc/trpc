/**
 * This is the client-side code that uses the inferred types from the server
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
/**
 * We only import the `AppRouter` type from the server - this is not available at runtime
 */
import type { AppRouter } from '../server/routers/_app.js';

// Initialize the tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});

// Call procedure functions

// 💡 Tip, try to:
// - hover any types below to see the inferred types
// - Cmd/Ctrl+click on any function to jump to the definition
// - Rename any variable and see it reflected across both frontend and backend

const users = await trpc.user.list.query();
//    ^?
console.log('Users:', users);

const createdUser = await trpc.user.create.mutate({ name: 'sachinraja' });
//    ^?
console.log('Created user:', createdUser);

const user = await trpc.user.byId.query('1');
//    ^?
console.log('User 1:', user);

const hello = await trpc.slow.hello.query();
//    ^?
console.log('slow.hello:', hello);
