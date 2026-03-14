import http from 'node:http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import/stream/utils/disposable';
import { describe, expect, it } from 'vitest';
import { createTRPCHeyApiClientConfig } from '../src/heyapi';
import {
  MongoEjsonRouter,
  mongoEjsonTransformer,
} from './routers/mongoEjsonRouter';
import { Sdk } from './routers/mongoEjsonRouter-heyapi';
import { client } from './routers/mongoEjsonRouter-heyapi/client.gen';

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

const ejsonClientConfig = createTRPCHeyApiClientConfig({
  transformer: mongoEjsonTransformer,
});

describe('MongoDB Extended JSON v2 transformer', () => {
  async function setupSdk() {
    const server = http.createServer(
      createHTTPHandler({ router: MongoEjsonRouter }),
    );
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;

    client.setConfig({ baseUrl, ...ejsonClientConfig });

    return makeAsyncResource(
      { sdk: new Sdk({ client }) },
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
  }

  it('round-trips strings, numbers, booleans, arrays, and Dates', () => {
    const serialized = mongoEjsonTransformer.serialize(richInput);
    const deserialized = mongoEjsonTransformer.deserialize(serialized);
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
