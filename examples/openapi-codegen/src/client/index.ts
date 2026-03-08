/**
 * This is the client-side code that uses a codegen'd hey-api SDK
 * instead of the vanilla tRPC client.
 *
 * The SDK is generated from the OpenAPI spec produced by @trpc/openapi.
 * Run `pnpm codegen` to regenerate.
 */
import { createTRPCHeyApiClientConfig } from '@trpc/openapi/heyapi';
import { transformer } from '../shared/transformer.js';
import { client } from './generated/client.gen.js';
import { Sdk } from './generated/sdk.gen.js';

// Configure the hey-api client with tRPC serialization helpers
client.setConfig({
  baseUrl: 'http://localhost:3000',
  ...createTRPCHeyApiClientConfig({ transformer }),
});

// Create an SDK instance
const sdk = new Sdk({ client });

async function main() {
  // List users (initially empty)
  const listResult = await sdk.user.list();
  console.log('Users:', listResult.data?.result.data);

  // Create a user
  const createResult = await sdk.user.create({
    body: { name: 'sachinraja' },
  });
  console.log('Created user:', createResult.data?.result.data);

  // Fetch the user by ID
  const byIdResult = await sdk.user.byId({
    query: {
      input: '1',
    },
    querySerializer: createTRPCHeyApiClientConfig({ transformer })
      .querySerializer,
  });
  console.log('User 1:', byIdResult.data?.result.data);
}

void main();
