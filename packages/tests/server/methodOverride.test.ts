import http from 'http';
import {
  createTRPCProxyClient,
  httpBatchLink,
  httpLink,
} from '@trpc/client/src';
import { HTTPLinkBaseOptions } from '@trpc/client/src/links/internals/httpUtils';
import { initTRPC } from '@trpc/server';
import { BaseHandlerOptions } from '@trpc/server/internals/types';
import { getPostBody } from '@trpc/server/src/adapters/node-http/content-type/json/getPostBody';
import { createHTTPHandler } from '@trpc/server/src/adapters/standalone';
import fetch from 'node-fetch';
import { afterEach, test } from 'vitest';
import { z } from 'zod';
import './___packages';
import { waitError } from './___testHelpers';

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
  methodOverride: BaseHandlerOptions<any, any>['unstable_methodOverride'];
  linkOptions?: Partial<HTTPLinkBaseOptions>;
  batch?: boolean;
}) {
  const handler = createHTTPHandler({
    router: router,
    unstable_methodOverride: opts.methodOverride,
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

  const client = createTRPCProxyClient<typeof router>({
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
    methodOverride: {
      enabled: false,
    },
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
    methodOverride: {
      enabled: true,
    },
    linkOptions: {
      unstable_methodOverride: 'POST',
    },
  });

  expect(
    await t.client.q.query({
      who: 'test1',
    }),
  ).toBe('hello test1');

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('POST');
  expect(req.url).toContain('_procedureType=query'); // maybe this should be _type=query? or instead?
});

test('client: sends mutation as GET when methodOverride=GET', async () => {
  const t = await setup({
    methodOverride: {
      enabled: true,
    },
    linkOptions: {
      unstable_methodOverride: 'GET',
    },
  });

  expect(
    await t.client.m.mutate({
      who: 'test1',
    }),
  ).toBe('hello test1');

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('GET');
  expect(req.url).toContain('_procedureType=mutation');
});

test('server: resolves request to a query despite POST method when methodOverride is enabled', async () => {
  const t = await setup({
    methodOverride: {
      enabled: true,
    },
  });

  const res = await fetch(
    `http://localhost:${t.port}/q?_procedureType=query&`,
    {
      method: 'POST',
      body: JSON.stringify({
        who: 'test1',
      }),
    },
  );

  const json = await res.json();

  expect(res.ok).toBeTruthy();
  expect(json).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": "hello test1",
      },
    }
  `);
});

test('server: resolves request to a mutation despite GET method when methodOverride is enabled', async () => {
  const t = await setup({
    methodOverride: {
      enabled: true,
    },
  });

  const urlencodedBody = encodeURIComponent(JSON.stringify({ who: 'test1' }));
  const res = await fetch(
    `http://localhost:${t.port}/m?_procedureType=mutation&input=${urlencodedBody}`,
    {
      method: 'GET',
    },
  );

  const json = await res.json();

  expect(res.ok).toBeTruthy();
  expect(json).toMatchInlineSnapshot(`
    Object {
      "result": Object {
        "data": "hello test1",
      },
    }
  `);
});

test('client&server: e2e query as POST', async () => {
  const t = await setup({
    methodOverride: {
      enabled: true,
    },
    linkOptions: {
      unstable_methodOverride: 'POST',
    },
  });

  expect(
    await t.client.q.query({
      who: 'test1',
    }),
  ).toBe('hello test1');

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('POST');
  expect(req.url).toContain('_procedureType=query');
  expect(req).toMatchInlineSnapshot(`
    Object {
      "body": Object {
        "who": "test1",
      },
      "method": "POST",
      "url": "/q?_procedureType=query",
    }
  `);
});

test('client&server: e2e mutation as GET', async () => {
  const t = await setup({
    methodOverride: {
      enabled: true,
    },
    linkOptions: {
      unstable_methodOverride: 'GET',
    },
  });

  expect(
    await t.client.m.mutate({
      who: 'test1',
    }),
  ).toBe('hello test1');

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('GET');
  expect(req.url).toContain('_procedureType=mutation');
  const urlencodedBody = encodeURIComponent(JSON.stringify({ who: 'test1' }));
  expect(req).toMatchInlineSnapshot(`
    Object {
      "body": null,
      "method": "GET",
      "url": "/m?_procedureType=mutation&input=${urlencodedBody}",
    }
  `);
});

test('client/server: e2e batched query as POST', async () => {
  const t = await setup({
    methodOverride: {
      enabled: true,
    },
    linkOptions: {
      unstable_methodOverride: 'POST',
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
      // TBD: should mutations be batched with queries?
      // t.client.m.mutate({
      //   who: 'test3',
      // }),
    ]),
  ).toEqual(['hello test1', 'hello test2']);

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('POST');
  expect(req.url).toContain('_procedureType=query');
  expect(req).toMatchInlineSnapshot(`
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
      "url": "/q,q?batch=1&_procedureType=query",
    }
  `);
});

test('client/server: e2e batched mutation as GET', async () => {
  const t = await setup({
    methodOverride: {
      enabled: true,
    },
    linkOptions: {
      unstable_methodOverride: 'GET',
    },
    batch: true,
  });

  expect(
    await Promise.all([
      t.client.m.mutate({
        who: 'test1',
      }),
      t.client.m.mutate({
        who: 'test2',
      }),
    ]),
  ).toEqual(['hello test1', 'hello test2']);

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('GET');
  expect(req.url).toContain('_procedureType=mutation');
  const urlencodedBody = encodeURIComponent(
    JSON.stringify({ '0': { who: 'test1' }, '1': { who: 'test2' } }),
  );
  expect(req).toMatchInlineSnapshot(`
    Object {
      "body": null,
      "method": "GET",
      "url": "/m,m?batch=1&_procedureType=mutation&input=${urlencodedBody}",
    }
  `);
});

test('server: rejects method override from client when not enabled on the server', async () => {
  const t = await setup({
    methodOverride: {
      enabled: false,
    },
    linkOptions: {
      unstable_methodOverride: 'POST',
    },
  });

  const err = await waitError(() =>
    t.client.q.query({
      who: 'test1',
    }),
  );

  expect(err).toMatchInlineSnapshot(
    '[TRPCClientError: Cannot use methodOverride on the client when methodOverride is not enabled on the server]',
  );

  expect(t.requests).toHaveLength(1);
  const req = t.requests[0]!;

  expect(req.method).toBe('POST');
  expect(req.url).toContain('_procedureType=query');
  expect(req).toMatchInlineSnapshot(`
    Object {
      "body": Object {
        "who": "test1",
      },
      "method": "POST",
      "url": "/q?_procedureType=query",
    }
  `);
});
