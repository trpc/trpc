/**
 * This is the client-side code that uses the inferred types from the server
 */
import {
  createTRPCClient,
  httpBatchStreamLink,
  isTRPCClientError,
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
  try {
    // This procedure registers the declared error, so the client receives
    // the declared payload unchanged and can narrow it by key.
    await trpc.examples.registered.query();
  } catch (error) {
    if (
      isTRPCClientError<AppRouter>(error) &&
      error.isDeclaredError('USER_NOT_FOUND')
    ) {
      console.log(`Registered declared error: ${error.data.reason}`);
    }
  }

  try {
    // This procedure throws the same declared error without registering it,
    // so it is downgraded and passed through the normal formatter path.
    await trpc.examples.unregistered.query();
  } catch (error) {
    if (isTRPCClientError<AppRouter>(error) && error.isFormattedError()) {
      console.log(`Formatted error requestId: ${error.data.requestId}`);
    }
  }
}

void main();
