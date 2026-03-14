/**
 * This is the client-side code that uses a codegen'd hey-api SDK
 * instead of the vanilla tRPC client.
 *
 * The SDK is generated from the OpenAPI spec produced by @trpc/openapi.
 * Run `pnpm codegen` to regenerate.
 */
import assert from 'node:assert/strict';
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
  assert.ok(listResult.data, 'list response should have data');
  assert.deepEqual(listResult.data.result.data, []);

  // Create a user
  const createResult = await sdk.user.create({
    body: { name: 'nick' },
  });
  console.log('Created user:', createResult.data?.result.data);
  assert.ok(createResult.data, 'create response should have data');
  assert.equal(createResult.data.result.data.name, 'nick');
  assert.equal(createResult.data.result.data.id, '1');
  assert.ok(
    createResult.data.result.data.createdAt instanceof Date,
    'createdAt should be a Date instance (transformer working)',
  );

  // Fetch the user by ID
  const byIdResult = await sdk.user.byId({
    query: {
      input: '1',
    },
    querySerializer: createTRPCHeyApiClientConfig({ transformer })
      .querySerializer,
  });
  console.log('User 1:', byIdResult.data?.result.data);
  assert.ok(byIdResult.data, 'byId response should have data');
  assert.equal(byIdResult.data.result.data.name, 'nick');
  assert.equal(byIdResult.data.result.data.id, '1');
  assert.ok(
    byIdResult.data.result.data.createdAt instanceof Date,
    'createdAt should be a Date instance (transformer working)',
  );
}

void main();
