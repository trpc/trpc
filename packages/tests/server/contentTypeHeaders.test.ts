import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const getMockFetch = () => vi.fn<typeof fetch>((...args) => fetch(...args));

test('query should not have content-type header', async () => {
  const t = initTRPC.create();
  const mockFetch = getMockFetch();

  const router = t.router({
    hello: t.procedure
      .input(z.string().optional())
      .query(({ input }) => `Hello ${input ?? 'world'}`),
  });

  await using ctx = testServerAndClientResource(router, {
    client(opts) {
      return {
        links: [
          httpLink({
            url: opts.httpUrl,
            fetch: mockFetch,
          }),
        ],
      };
    },
  });

  const result = await ctx.client.hello.query('test');
  expect(result).toBe('Hello test');

  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockFetch.mock.calls[0]!;

  expect(options!.method).toBe('GET');

  expect(options!.headers).not.toHaveProperty('content-type');
});

test('mutation should have content-type header', async () => {
  const mockFetch = getMockFetch();
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure
      .input(z.string())
      .mutation(({ input }) => `Hello ${input}`),
  });

  await using ctx = testServerAndClientResource(router, {
    client(opts) {
      return {
        links: [
          httpLink({
            url: opts.httpUrl,
            fetch: mockFetch,
          }),
        ],
      };
    },
  });

  const result = await ctx.client.hello.mutate('test');
  expect(result).toBe('Hello test');

  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockFetch.mock.calls[0]!;

  expect(options!.method).toBe('POST');

  expect(options!.headers).toHaveProperty('content-type', 'application/json');
});

test('query with methodOverride should have content-type header', async () => {
  const mockFetch = getMockFetch();
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.input(z.string()).query(({ input }) => `Hello ${input}`),
  });

  await using ctx = testServerAndClientResource(router, {
    server: {
      allowMethodOverride: true,
    },
    client(opts) {
      return {
        links: [
          httpLink({
            url: opts.httpUrl,
            fetch: mockFetch,
            methodOverride: 'POST',
          }),
        ],
      };
    },
  });

  const result = await ctx.client.hello.query('test');

  expect(result).toBe('Hello test');

  expect(mockFetch).toHaveBeenCalledTimes(1);
  const [url, options] = mockFetch.mock.calls[0]!;

  expect(options!.method).toBe('POST');

  expect(options!.headers).toHaveProperty('content-type', 'application/json');
});
