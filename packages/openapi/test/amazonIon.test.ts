import http from 'node:http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import/stream/utils/disposable';
import { describe, expect, it } from 'vitest';
import { configureTRPCHeyApiClient } from '../src/heyapi';
import { Sdk } from './routers/amazonIonRouter-heyapi';
import { client } from './routers/amazonIonRouter-heyapi/client.gen';
import {
  AmazonIonRouter,
  amazonIonTransformer,
} from './routers/amazonIonRouter.router';

const richInput = {
  name: 'Alice',
  count: 42,
  active: true,
  tags: ['a', 'b'],
  at: new Date('2025-06-15T10:00:00Z'),
  meta: { createdBy: 'admin', updatedAt: new Date('2025-06-16T12:00:00Z') },
  items: [
    { id: 1, label: 'first' },
    { id: 2, label: 'second' },
  ],
};

describe('Amazon Ion transformer', () => {
  async function setupSdk() {
    const server = http.createServer(
      createHTTPHandler({ router: AmazonIonRouter }),
    );
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;

    configureTRPCHeyApiClient(client, {
      baseUrl,
      transformer: amazonIonTransformer,
    });

    return makeAsyncResource(
      { sdk: new Sdk({ client }) },
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
  }

  it('round-trips strings, numbers, booleans, arrays, and Dates', () => {
    const serialized = amazonIonTransformer.serialize(richInput);
    const deserialized = amazonIonTransformer.deserialize(serialized);
    expect(deserialized).toStrictEqual(richInput);
  });

  it('query: round-trips rich types through the generated client', async () => {
    await using ctx = await setupSdk();

    const result = await ctx.sdk.rich.query({ query: { input: richInput } });

    expect(result.data).toBeDefined();
    expect(result.data!.result.data).toStrictEqual(richInput);
  });

  it('mutation: round-trips rich types through the generated client', async () => {
    await using ctx = await setupSdk();

    const result = await ctx.sdk.rich.mutate({ body: richInput });

    expect(result.data).toBeDefined();
    expect(result.data!.result.data).toStrictEqual(richInput);
  });
});
