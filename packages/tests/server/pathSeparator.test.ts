import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import {
  createTRPCClient,
  httpBatchLink,
  httpBatchStreamLink,
  httpLink,
  httpSubscriptionLink,
  splitLink,
  TRPCClientError,
} from '@trpc/client';
import type { TRPCPathSeparator } from '@trpc/server';
import { initTRPC, lazy, TRPCError } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import express from 'express';
import fastify from 'fastify';
import fetch from 'node-fetch';
import { z } from 'zod';

function createRouter(pathSeparator?: TRPCPathSeparator) {
  const t = initTRPC.create({ pathSeparator });
  const middlewarePaths: string[] = [];
  const proc = t.procedure.use((opts) => {
    middlewarePaths.push(opts.path);
    return opts.next();
  });
  const router = t.router({
    post: {
      byId: proc
        .input(z.object({ id: z.number() }))
        .query((opts) => ({ id: opts.input.id })),
      list: proc.query(() => ['a', 'b']),
      add: proc.input(z.string()).mutation((opts) => opts.input),
      fail: proc.query(() => {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'nope' });
      }),
      onAdd: proc.subscription(async function* () {
        yield 1;
        yield 2;
      }),
    },
    'flat.key': proc.query(() => 'flat'),
  });
  return { router, middlewarePaths };
}

function recordingFetch() {
  const urls: string[] = [];
  const fn = ((url: string, init: any) => {
    urls.push(new URL(url).pathname);
    return fetch(url, init);
  }) as any;
  return { urls, fetch: fn };
}

describe('pathSeparator: "/"', () => {
  async function setup() {
    const { router, middlewarePaths } = createRouter('/');
    const rec = recordingFetch();
    const ctx = testServerAndClientResource(router, {
      client: ({ httpUrl }) => ({
        links: [
          splitLink({
            condition: (op) => op.type === 'subscription',
            true: httpSubscriptionLink({ url: httpUrl, pathSeparator: '/' }),
            false: splitLink({
              condition: (op) => op.context['link'] === 'httpLink',
              true: httpLink({
                url: httpUrl,
                fetch: rec.fetch,
                pathSeparator: '/',
              }),
              false: splitLink({
                condition: (op) => op.context['link'] === 'stream',
                true: httpBatchStreamLink({
                  url: httpUrl,
                  fetch: rec.fetch,
                  pathSeparator: '/',
                }),
                false: httpBatchLink({
                  url: httpUrl,
                  fetch: rec.fetch,
                  pathSeparator: '/',
                }),
              }),
            }),
          }),
        ],
      }),
    });
    return { ...ctx, middlewarePaths, urls: rec.urls };
  }

  test('httpLink puts "/" in the URL', async () => {
    await using t = await setup();
    const context = { link: 'httpLink' };

    expect(await t.client.post.byId.query({ id: 1 }, { context })).toEqual({
      id: 1,
    });
    expect(await t.client.post.add.mutate('x', { context })).toBe('x');

    expect(t.urls).toEqual(['/post/byId', '/post/add']);
  });

  test('httpBatchLink joins "/" paths with ","', async () => {
    await using t = await setup();

    expect(
      await Promise.all([
        t.client.post.byId.query({ id: 1 }),
        t.client.post.list.query(),
      ]),
    ).toEqual([{ id: 1 }, ['a', 'b']]);

    expect(t.urls).toEqual(['/post/byId,post/list']);
  });

  test('httpBatchStreamLink', async () => {
    await using t = await setup();
    const context = { link: 'stream' };

    expect(
      await Promise.all([
        t.client.post.byId.query({ id: 2 }, { context }),
        t.client.post.list.query(undefined, { context }),
      ]),
    ).toEqual([{ id: 2 }, ['a', 'b']]);

    expect(t.urls).toEqual(['/post/byId,post/list']);
  });

  test('httpSubscriptionLink', async () => {
    await using t = await setup();

    const values: number[] = [];
    await new Promise<void>((resolve, reject) => {
      const sub = t.client.post.onAdd.subscribe(undefined, {
        onData(value) {
          values.push(value);
          if (values.length === 2) {
            sub.unsubscribe();
            resolve();
          }
        },
        onError: reject,
      });
    });
    expect(values).toEqual([1, 2]);
  });

  test('middlewares, onError and error shapes still see dotted paths', async () => {
    await using t = await setup();

    await t.client.post.list.query();
    const err = await waitError(t.client.post.fail.query(), TRPCClientError);

    expect(t.middlewarePaths).toEqual(['post.list', 'post.fail']);
    expect(err.data?.path).toBe('post.fail');
    expect(t.onErrorSpy).toHaveBeenCalledTimes(1);
    expect(t.onErrorSpy.mock.calls[0]![0].path).toBe('post.fail');
  });

  test('a key containing "." is served at the same URL as nesting', async () => {
    await using t = await setup();

    expect(await t.client['flat.key'].query()).toBe('flat');
    expect(t.urls).toEqual(['/flat/key']);
  });

  test('the server still accepts dotted URLs', async () => {
    await using t = await setup();

    const res = await fetch(
      `${t.httpUrl}/post.byId?input=${encodeURIComponent(JSON.stringify({ id: 3 }))}`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: { data: { id: 3 } } });
  });

  test('server-side callers still use dotted paths', async () => {
    const { router, middlewarePaths } = createRouter('/');
    const caller = router.createCaller({});

    expect(await caller.post.byId({ id: 4 })).toEqual({ id: 4 });
    expect(middlewarePaths).toEqual(['post.byId']);
  });
});

test('pathSeparator: "~"', async () => {
  const { router } = createRouter('~');
  await using t = testServerAndClientResource(router);

  const res = await fetch(
    `${t.httpUrl}/post~byId,post~list?batch=1&input=${encodeURIComponent(JSON.stringify({ 0: { id: 5 } }))}`,
  );
  expect(await res.json()).toEqual([
    { result: { data: { id: 5 } } },
    { result: { data: ['a', 'b'] } },
  ]);
});

test('default: "/" in the URL is not a separator', async () => {
  const { router } = createRouter();
  await using t = testServerAndClientResource(router);

  const res = await fetch(`${t.httpUrl}/post/list`);
  expect(res.status).toBe(404);

  const dotted = await fetch(`${t.httpUrl}/post.list`);
  expect(dotted.status).toBe(200);
});

test('client with "/" against a server without it gets NOT_FOUND', async () => {
  const { router } = createRouter();
  await using t = testServerAndClientResource(router, {
    client: ({ httpUrl }) => ({
      links: [
        httpLink({ url: httpUrl, fetch: fetch as any, pathSeparator: '/' }),
      ],
    }),
  });

  const err = await waitError(t.client.post.list.query(), TRPCClientError);
  expect(err.data?.code).toBe('NOT_FOUND');
});

describe('keys containing the separator', () => {
  test('are rejected when the router is built', () => {
    const t = initTRPC.create({ pathSeparator: '_' });

    expect(() =>
      t.router({ get_user: t.procedure.query(() => null) }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Key "get_user" contains the pathSeparator "_", so its URL would be ambiguous. Rename it or pick another pathSeparator.]`,
    );
    expect(() =>
      t.router({ user: { by_id: t.procedure.query(() => null) } }),
    ).toThrow('Key "user.by_id" contains the pathSeparator "_"');
    expect(() =>
      t.router({ my_users: { list: t.procedure.query(() => null) } }),
    ).toThrow('Key "my_users" contains the pathSeparator "_"');
  });

  test('are rejected in sub-routers built without a separator', () => {
    const plain = initTRPC.create();
    const sub = plain.router({ by_id: plain.procedure.query(() => null) });
    const t = initTRPC.create({ pathSeparator: '_' });

    expect(() => t.router({ user: sub })).toThrow(
      'Key "user.by_id" contains the pathSeparator "_"',
    );
  });

  test('are rejected in lazy routers when they load', async () => {
    const plain = initTRPC.create();
    const t = initTRPC.create({ pathSeparator: '_' });
    const router = t.router({
      user: lazy(async () =>
        plain.router({ by_id: plain.procedure.query(() => null) }),
      ),
    });

    await expect(router.createCaller({}).user.by_id()).rejects.toThrow(
      'Key "user.by_id" contains the pathSeparator "_"',
    );
  });

  test('are fine with the default separator', () => {
    const t = initTRPC.create();
    expect(() =>
      t.router({ get_user: t.procedure.query(() => null) }),
    ).not.toThrow();
  });
});

describe('mergeRouters', () => {
  test('keeps the separator', () => {
    const a = initTRPC.create({ pathSeparator: '/' });
    const b = initTRPC.create();
    const merged = a.mergeRouters(
      b.router({ x: b.procedure.query(() => null) }),
      a.router({ y: a.procedure.query(() => null) }),
    );
    expect(merged._def._config.pathSeparator).toBe('/');
  });

  test('throws on different separators', () => {
    const a = initTRPC.create({ pathSeparator: '/' });
    const b = initTRPC.create({ pathSeparator: '~' });
    expect(() =>
      a.mergeRouters(
        a.router({ x: a.procedure.query(() => null) }),
        b.router({ y: b.procedure.query(() => null) }),
      ),
    ).toThrow('You seem to have several pathSeparators');
  });
});

test('invalid separators are rejected', () => {
  expect(() =>
    initTRPC.create({ pathSeparator: ',' as any }),
  ).toThrowErrorMatchingInlineSnapshot(
    `[Error: Invalid pathSeparator ",". Use one of: ".", "/", "_", "~"]`,
  );
  expect(() =>
    httpLink({ url: 'http://localhost', pathSeparator: '?' as any }),
  ).toThrow('Invalid pathSeparator "?"');

  expect(() =>
    initTRPC.create({
      // @ts-expect-error - not a valid separator
      pathSeparator: ',',
    }),
  ).toThrow();
});

describe('adapters with "/"', () => {
  test('express', async () => {
    const { router } = createRouter('/');
    const app = express();
    app.use('/trpc', trpcExpress.createExpressMiddleware({ router }));
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as { port: number };

    const client = createTRPCClient<typeof router>({
      links: [
        httpBatchLink({
          url: `http://localhost:${port}/trpc`,
          fetch: fetch as any,
          pathSeparator: '/',
        }),
      ],
    });
    try {
      expect(
        await Promise.all([
          client.post.byId.query({ id: 6 }),
          client.post.list.query(),
        ]),
      ).toEqual([{ id: 6 }, ['a', 'b']]);
    } finally {
      server.close();
    }
  });

  test('fastify', async () => {
    const { router } = createRouter('/');
    const app = fastify();
    await app.register(fastifyTRPCPlugin, {
      prefix: '/trpc',
      trpcOptions: { router },
    });
    const url = await app.listen({ port: 0 });

    const client = createTRPCClient<typeof router>({
      links: [
        httpBatchLink({
          url: `${url}/trpc`,
          fetch: fetch as any,
          pathSeparator: '/',
        }),
      ],
    });
    try {
      expect(
        await Promise.all([
          client.post.byId.query({ id: 7 }),
          client.post.add.mutate('y'),
        ]),
      ).toEqual([{ id: 7 }, 'y']);
    } finally {
      await app.close();
    }
  });
});
