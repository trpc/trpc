import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { httpBatchLink, httpLink } from '@trpc/client';
import type { HTTPLinkBaseOptions } from '@trpc/client/links/internals/httpUtils';
import { initTRPC } from '@trpc/server';
import type { inferRouterRootTypes } from '@trpc/server/unstable-core-do-not-import';
import fetch from 'node-fetch';
import { afterEach, test } from 'vitest';
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
  allowMethodOverride: boolean;
}) {
  return testServerAndClientResource(router, {
    server: {
      allowMethodOverride: opts.allowMethodOverride,
    },
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
test('client: sends query as POST when methodOverride=POST', async () => {
  await using t = await startServer({
    linkOptions: {
      methodOverride: 'POST',
    },
    allowMethodOverride: true,
  });

  expect(
    await t.client.q.query({
      who: 'test1',
    }),
  ).toBe('hello test1');
});

test('client/server: e2e batched query as POST', async () => {
  await using t = await startServer({
    linkOptions: {
      methodOverride: 'POST',
    },
    batch: true,
    allowMethodOverride: true,
  });

  expect(
    await Promise.all([
      t.client.q.query({
        who: 'test1',
      }),
      t.client.q.query({
        who: 'test2',
      }),
      t.client.m.mutate({
        who: 'test3',
      }),
    ]),
  ).toMatchInlineSnapshot(`
    Array [
      "hello test1",
      "hello test2",
      "hello test3",
    ]
  `);
});

test('server: rejects method override from client when not enabled on the server', async () => {
  await using t = await startServer({
    allowMethodOverride: false,
    linkOptions: {
      methodOverride: 'POST',
    },
  });

  const err = await waitError(() =>
    t.client.q.query({
      who: 'test1',
    }),
  );

  expect(err).toMatchInlineSnapshot(
    `[TRPCClientError: Unsupported POST-request to query procedure at path "q"]`,
  );
});

test('cannot use method overriding with mutations', async () => {
  await using t = await startServer({
    allowMethodOverride: true,
    linkOptions: {},
  });

  const err = await waitError(() => {
    // @ts-expect-error - testing invalid usage
    return t.client.m.query({
      who: 'test1',
    });
  });
  expect(err).toMatchInlineSnapshot(
    `[TRPCClientError: Unsupported GET-request to mutation procedure at path "m"]`,
  );
});

test('server: 405 lists the methods the procedure accepts', async () => {
  await using t = await startServer({
    linkOptions: {},
    allowMethodOverride: false,
  });

  const query = await fetch(`${t.httpUrl}/q`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  expect(query.status).toBe(405);
  expect(query.headers.get('allow')).toBe('GET');

  const mutation = await fetch(`${t.httpUrl}/m?input=${JSON.stringify({})}`);
  expect(mutation.status).toBe(405);
  expect(mutation.headers.get('allow')).toBe('POST');
});

test('server: 405 lists POST for queries when methodOverride is allowed', async () => {
  await using t = await startServer({
    linkOptions: {},
    allowMethodOverride: true,
  });

  const res = await fetch(`${t.httpUrl}/q`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(405);
  expect(res.headers.get('allow')).toBe('GET, POST');
});
