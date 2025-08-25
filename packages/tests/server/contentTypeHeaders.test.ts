import { routerToServerAndClientNew } from './___testHelpers';
import { createTRPCClient, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockClear();
  mockFetch.mockImplementation((url, options) => {
    return fetch(url, options);
  });
});

test('query should not have content-type header', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure
      .input(z.string().optional())
      .query(({ input }) => `Hello ${input ?? 'world'}`),
  });

  const { httpUrl, close } = routerToServerAndClientNew(router);

  const client = createTRPCClient<typeof router>({
    links: [httpLink({ url: httpUrl, fetch: mockFetch as any })],
  });

  const result = await client.hello.query('test');
  expect(result).toBe('Hello test');

  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockFetch.mock.calls[0]!;

  expect(options.method).toBe('GET');

  expect(options.headers).not.toHaveProperty('content-type');

  await close();
});

test('mutation should have content-type header', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure
      .input(z.string())
      .mutation(({ input }) => `Hello ${input}`),
  });

  const { httpUrl, close } = routerToServerAndClientNew(router);

  const client = createTRPCClient<typeof router>({
    links: [httpLink({ url: httpUrl, fetch: mockFetch as any })],
  });

  const result = await client.hello.mutate('test');
  expect(result).toBe('Hello test');

  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockFetch.mock.calls[0]!;

  expect(options.method).toBe('POST');

  expect(options.headers).toHaveProperty('content-type', 'application/json');

  await close();
});

test('query with methodOverride should have content-type header', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.input(z.string()).query(({ input }) => `Hello ${input}`),
  });

  const { httpUrl, close } = routerToServerAndClientNew(router, {
    server: {
      allowMethodOverride: true,
    },
  });

  const client = createTRPCClient<typeof router>({
    links: [
      httpLink({
        url: httpUrl,
        methodOverride: 'POST',
        fetch: mockFetch as any,
      }),
    ],
  });

  const result = await client.hello.query('test');
  expect(result).toBe('Hello test');

  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockFetch.mock.calls[0]!;

  expect(options.method).toBe('POST');

  expect(options.headers).toHaveProperty('content-type', 'application/json');

  await close();
});
