import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { httpBatchLink, httpLink } from '@trpc/client';
import type { HTTPLinkBaseOptions } from '@trpc/client/links/internals/httpUtils';
import { initTRPC } from '@trpc/server';
import type { inferRouterRootTypes } from '@trpc/server/unstable-core-do-not-import';
import fetch from 'node-fetch';
import { expect, test, vi } from 'vitest';
import * as z from 'zod';

const t = initTRPC.create();
const router = t.router({
  q: t.procedure
    .input(
      z.object({
        who: z.string().nullish(),
      }),
    )
    .query((opts) => `hello ${opts.input?.who ?? 'world'}`),
  qLargeInput: t.procedure
    .input(
      z.object({
        data: z.string(),
      }),
    )
    .query((opts) => `received ${opts.input.data.length} chars`),
  m: t.procedure
    .input(
      z.object({
        who: z.string().nullish(),
      }),
    )
    .mutation((opts) => `hello ${opts.input?.who ?? 'world'}`),
});

function createFetchSpy() {
  const calls: { url: string; method: string }[] = [];
  const spy = vi.fn((url: string, init?: { method?: string }) => {
    calls.push({ url, method: init?.method ?? 'GET' });
    return (fetch as any)(url, init);
  });
  return { spy, calls };
}

async function startServer(opts: {
  linkOptions: Partial<
    HTTPLinkBaseOptions<inferRouterRootTypes<typeof router>>
  >;
  batch?: boolean;
  fetchSpy?: ReturnType<typeof vi.fn>;
}) {
  return testServerAndClientResource(router, {
    server: {},
    client(clientOpts) {
      return {
        links: [
          opts.batch
            ? httpBatchLink({
                url: clientOpts.httpUrl,
                fetch: (opts.fetchSpy ?? fetch) as any,
                ...opts.linkOptions,
              })
            : httpLink({
                url: clientOpts.httpUrl,
                fetch: (opts.fetchSpy ?? fetch) as any,
                ...opts.linkOptions,
              }),
        ],
      };
    },
  });
}

test('client: sends query as QUERY method when queryMethod=QUERY', async () => {
  const { spy, calls } = createFetchSpy();
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'QUERY',
    },
    fetchSpy: spy,
  });

  expect(
    await t.client.q.query({
      who: 'test1',
    }),
  ).toBe('hello test1');

  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('QUERY');
  expect(calls[0]!.url).not.toContain('input=');
});

test('client: QUERY method handles large inputs in body', async () => {
  const { spy, calls } = createFetchSpy();
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'QUERY',
    },
    fetchSpy: spy,
  });

  const largeData = 'x'.repeat(10000);
  expect(
    await t.client.qLargeInput.query({
      data: largeData,
    }),
  ).toBe('received 10000 chars');

  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('QUERY');
  expect(calls[0]!.url).not.toContain('input=');
});

test('client: GET method still works by default', async () => {
  const { spy, calls } = createFetchSpy();
  await using t = await startServer({
    linkOptions: {},
    fetchSpy: spy,
  });

  expect(
    await t.client.q.query({
      who: 'test-default',
    }),
  ).toBe('hello test-default');

  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('GET');
  expect(calls[0]!.url).toContain('input=');
});

test('client: queryMethod=GET explicitly uses GET', async () => {
  const { spy, calls } = createFetchSpy();
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'GET',
    },
    fetchSpy: spy,
  });

  expect(
    await t.client.q.query({
      who: 'test-explicit-get',
    }),
  ).toBe('hello test-explicit-get');

  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('GET');
  expect(calls[0]!.url).toContain('input=');
});

test('client/server: e2e batched query as QUERY', async () => {
  const { spy, calls } = createFetchSpy();
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'QUERY',
    },
    batch: true,
    fetchSpy: spy,
  });

  expect(
    await Promise.all([
      t.client.q.query({
        who: 'test1',
      }),
      t.client.q.query({
        who: 'test2',
      }),
    ]),
  ).toMatchInlineSnapshot(`
    Array [
      "hello test1",
      "hello test2",
    ]
  `);

  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('QUERY');
  expect(calls[0]!.url).not.toContain('input=');
});

test('mutations still use POST when queryMethod=QUERY', async () => {
  const { spy, calls } = createFetchSpy();
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'QUERY',
    },
    fetchSpy: spy,
  });

  expect(
    await t.client.m.mutate({
      who: 'mutation-test',
    }),
  ).toBe('hello mutation-test');

  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('POST');
});

test('methodOverride takes precedence over queryMethod', async () => {
  const { spy, calls } = createFetchSpy();
  await using t = await startServer({
    linkOptions: {
      methodOverride: 'POST',
      queryMethod: 'QUERY',
    },
    fetchSpy: spy,
  });

  // methodOverride: 'POST' takes precedence over queryMethod: 'QUERY'
  // Server needs allowMethodOverride: true for POST queries
  // Since we didn't set it, this should fail
  const err = await waitError(() =>
    t.client.q.query({
      who: 'test1',
    }),
  );

  expect(err).toMatchInlineSnapshot(
    `[TRPCClientError: Unsupported POST-request to query procedure at path "q"]`,
  );

  // Verify POST was used, not QUERY
  expect(calls).toHaveLength(1);
  expect(calls[0]!.method).toBe('POST');
});
