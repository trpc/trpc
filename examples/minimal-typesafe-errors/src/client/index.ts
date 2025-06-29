/**
 * This is the client-side code that uses the inferred types from the server
 */
import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  safe,
  safeAsyncIterable,
  splitLink,
} from '@trpc/client';
/**
 * We only import the `AppRouter` type from the server - this is not available at runtime
 */
import type { AppRouter } from '../server/index.js';
import { transformer } from '../shared/transformer.js';

// Initialize the tRPC client
const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchStreamLink({
      url: 'http://localhost:3000',
      transformer,
    }),
  ],
});

async function main() {
  // Call procedure functions

  // 💡 Tip, try to:
  // - hover any types below to see the inferred types
  // - Cmd/Ctrl+click on any function to jump to the definition
  // - Rename any variable and see it reflected across both frontend and backend

  const [users, usersError] = await safe(trpc.user.list.query());
  console.log('Users:', users, usersError?.message);

  const [createdUser, createUserError] = await safe(
    trpc.user.create.mutate({ name: 'sachinraja' }),
  );
  console.log('Created user:', createdUser, createUserError?.message);

  const [user, userError] = await safe(trpc.user.byId.query('1'));
  console.log('User 1:', user, userError?.message);

  const iterable = await trpc.examples.iterable.query();

  for await (const [i, iError] of safeAsyncIterable(iterable)) {
    console.log(
      'Iterable:',
      i,
      iError?.data?.customCode === 'NUMBER_TOO_HIGH'
        ? `${iError.message} (number: ${iError.data.customData.number})`
        : iError?.message,
    );
  }
}

void main();
