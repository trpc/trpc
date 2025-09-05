import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpBatchStreamLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const getMockFetch = () => vi.fn<typeof fetch>((...args) => fetch(...args));

test('should not send duplicate Transfer-Encoding: chunked headers with multiple mutations', async () => {
  const t = initTRPC.create();
  const mockFetch = getMockFetch();

  const router = t.router({
    hello: t.procedure
      .input(z.string())
      .mutation((opts) => `Hello ${opts.input}`),
    world: t.procedure
      .input(z.string())
      .mutation((opts) => `World ${opts.input}`),
  });

  await using ctx = testServerAndClientResource(router, {
    client(opts) {
      return {
        links: [
          httpBatchStreamLink({
            url: opts.httpUrl,
            fetch: mockFetch,
          }),
        ],
      };
    },
  });

  // Use tRPC client to make batched requests
  const results = await Promise.all([
    ctx.client.hello.mutate('test1'),
    ctx.client.world.mutate('test2'),
  ]);

  expect(results[0]).toBe('Hello test1');
  expect(results[1]).toBe('World test2');

  expect(mockFetch).toHaveBeenCalledTimes(1);

  // Check the response headers from the mock fetch
  const response = (await mockFetch.mock.results[0]!.value) as Response;
  expect(response.ok).toBe(true);
  const filteredHeaders = Array.from(response.headers.entries()).filter(
    (entry) => {
      const key = Array.isArray(entry) ? entry[0] : entry;
      return (
        typeof key === 'string' && key.toLowerCase() === 'transfer-encoding'
      );
    },
  );
  expect(filteredHeaders).toHaveLength(1);
  expect(filteredHeaders[0]).toMatchInlineSnapshot(`
    Array [
      "transfer-encoding",
      "chunked",
    ]
  `);
  expect(
    Array.from(response.headers.entries()).filter(([key]) => key !== 'date'),
  ).toMatchInlineSnapshot(`
    Array [
      Array [
        "connection",
        "keep-alive",
      ],
      Array [
        "content-type",
        "application/json",
      ],
      Array [
        "keep-alive",
        "timeout=5",
      ],
      Array [
        "transfer-encoding",
        "chunked",
      ],
      Array [
        "vary",
        "trpc-accept",
      ],
    ]
  `);
});
