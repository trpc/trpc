import http from 'http';
import { waitError } from './___testHelpers';
import {
  createTRPCClient,
  createTRPCProxyClient,
  httpBatchLink,
  httpLink,
} from '@trpc/client';
import type { HTTPLinkBaseOptions } from '@trpc/client/links/internals/httpUtils';
import { initTRPC } from '@trpc/server';
import { getPostBody } from '@trpc/server/adapters/node-http/content-type/json/getPostBody';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import type {
  BaseHandlerOptions,
  inferRouterRootTypes,
} from '@trpc/server/unstable-core-do-not-import';
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
  const handler = createHTTPHandler({
    router: router,
    allowMethodOverride: opts.allowMethodOverride,
  });
  const requests: {
    method: string;
    url: string;
    body: unknown;
  }[] = [];
  const server = http.createServer(async (req, res) => {
    assert(req.url);
    assert(req.method);
    const bodyResult = await getPostBody({ req });

    const body =
      bodyResult.ok && bodyResult.data !== undefined
        ? JSON.parse(bodyResult.data as string)
        : null;

    requests.push({
      method: req.method,
      url: req.url,
      body,
    });

    (req as any).body = body;

    handler(req, res);
  });

  server.listen(0);

  const port = (server.address() as any).port as number;

  const client = createTRPCClient<typeof router>({
    links: [
      opts.batch
        ? httpBatchLink({
            url: `http://localhost:${port}`,
            fetch: fetch as any,
            ...opts.linkOptions,
          })
        : httpLink({
            url: `http://localhost:${port}`,
            fetch: fetch as any,
            ...opts.linkOptions,
          }),
    ],
  });

  return {
    port,
    router,
    client,
    requests,
    close: () => {
      return new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    },
  };
}
let app: Awaited<ReturnType<typeof startServer>>;
async function setup(...args: Parameters<typeof startServer>) {
  app = await startServer(...args);
  return app;
}

afterEach(async () => {
  if (app) {
    app.close();
  }
});

test('normal queries (sanity check)', async () => {
  const t = await setup({
    linkOptions: {},
    allowMethodOverride: true,
  });

  expect(
    await t.client.q.query({
      who: 'test1',
    }),
  ).toBe('hello test1');
  expect(
    await t.client.m.mutate({
      who: 'test2',
    }),
  ).toBe('hello test2');

  expect(t.requests.map((req) => req.method)).toEqual(['GET', 'POST']);
  expect(t.requests).toMatchInlineSnapshot(`
    Array [
      Object {
        "body": null,
        "method": "GET",
        "url": "/q?input=%7B%22who%22%3A%22test1%22%7D",
      },
      Object {
        "body": Object {
          "who": "test2",
        },
        "method": "POST",
        "url": "/m",
      },
    ]
  `);
});

test('client: sends query as POST when methodOverride=POST', async () => {
  const t = await setup({
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

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('POST');
  expect(t.requests).toMatchInlineSnapshot(`
    Array [
      Object {
        "body": Object {
          "who": "test1",
        },
        "method": "POST",
        "url": "/q",
      },
    ]
  `);
});

test('client/server: e2e batched query as POST', async () => {
  const t = await setup({
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

  expect(t.requests).toHaveLength(2);

  const [query, mutation] = t.requests;

  expect(mutation!.method).toBe('POST');
  expect(query!.method).toBe('POST');
  expect(t.requests).toMatchInlineSnapshot(`
    Array [
      Object {
        "body": Object {
          "0": Object {
            "who": "test1",
          },
          "1": Object {
            "who": "test2",
          },
        },
        "method": "POST",
        "url": "/q,q?batch=1",
      },
      Object {
        "body": Object {
          "0": Object {
            "who": "test3",
          },
        },
        "method": "POST",
        "url": "/m?batch=1",
      },
    ]
  `);
});

test('server: rejects method override from client when not enabled on the server', async () => {
  const t = await setup({
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
    `[TRPCClientError: No "mutation"-procedure on path "q"]`,
  );

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('POST');
  expect(req).toMatchInlineSnapshot(`
    Object {
      "body": Object {
        "who": "test1",
      },
      "method": "POST",
      "url": "/q",
    }
  `);
});
