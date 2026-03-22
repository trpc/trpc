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
    // the declared shape on `error.shape.data`.
    await trpc.examples.registered.query();
  } catch (error) {
    if (isTRPCClientError<AppRouter>(error)) {
      if (error.shape?.data && 'reason' in error.shape.data) {
        console.log(`Registered declared error: ${error.shape.data.reason}`);
      }
    }
  }

  try {
    // This procedure throws the same declared error without registering it,
    // so it is downgraded and passed through the normal formatter path.
    await trpc.examples.unregistered.query();
  } catch (error) {
    if (isTRPCClientError<AppRouter>(error)) {
      if (error.data && 'code' in error.data) {
        console.log(`Formatted error requestId: ${error.data.requestId}`);
      }
    }
  }
}

void main();
