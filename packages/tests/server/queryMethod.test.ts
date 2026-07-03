import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { httpBatchLink, httpLink } from '@trpc/client';
import type { HTTPLinkBaseOptions } from '@trpc/client/links/internals/httpUtils';
import { initTRPC } from '@trpc/server';
import type { inferRouterRootTypes } from '@trpc/server/unstable-core-do-not-import';
import fetch from 'node-fetch';
import { expect, test } from 'vitest';
import { z } from 'zod';

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

async function startServer(opts: {
  linkOptions: Partial<
    HTTPLinkBaseOptions<inferRouterRootTypes<typeof router>>
  >;
  batch?: boolean;
}) {
  return testServerAndClientResource(router, {
    server: {},
    client(clientOpts) {
      return {
        links: [
          opts.batch
            ? httpBatchLink({
                url: clientOpts.httpUrl,
                fetch: fetch as any,
                ...opts.linkOptions,
              })
            : httpLink({
                url: clientOpts.httpUrl,
                fetch: fetch as any,
                ...opts.linkOptions,
              }),
        ],
      };
    },
  });
}

test('client: sends query as QUERY method when queryMethod=QUERY', async () => {
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'QUERY',
    },
  });

  expect(
    await t.client.q.query({
      who: 'test1',
    }),
  ).toBe('hello test1');
});

test('client: QUERY method handles large inputs in body', async () => {
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'QUERY',
    },
  });

  const largeData = 'x'.repeat(10000);
  expect(
    await t.client.qLargeInput.query({
      data: largeData,
    }),
  ).toBe('received 10000 chars');
});

test('client: GET method still works by default', async () => {
  await using t = await startServer({
    linkOptions: {},
  });

  expect(
    await t.client.q.query({
      who: 'test-default',
    }),
  ).toBe('hello test-default');
});

test('client: queryMethod=GET explicitly uses GET', async () => {
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'GET',
    },
  });

  expect(
    await t.client.q.query({
      who: 'test-explicit-get',
    }),
  ).toBe('hello test-explicit-get');
});

test('client/server: e2e batched query as QUERY', async () => {
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'QUERY',
    },
    batch: true,
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
});

test('mutations still use POST when queryMethod=QUERY', async () => {
  await using t = await startServer({
    linkOptions: {
      queryMethod: 'QUERY',
    },
  });

  expect(
    await t.client.m.mutate({
      who: 'mutation-test',
    }),
  ).toBe('hello mutation-test');
});

test('methodOverride takes precedence over queryMethod', async () => {
  // When both are set, methodOverride should win
  await using t = await startServer({
    linkOptions: {
      methodOverride: 'POST',
      queryMethod: 'QUERY',
    },
  });

  // This should work because methodOverride: 'POST' is used
  // However, the server needs allowMethodOverride: true for POST queries
  // Since we didn't set it, this should fail
  const err = await waitError(() =>
    t.client.q.query({
      who: 'test1',
    }),
  );

  expect(err).toMatchInlineSnapshot(
    `[TRPCClientError: Unsupported POST-request to query procedure at path "q"]`,
  );
});
