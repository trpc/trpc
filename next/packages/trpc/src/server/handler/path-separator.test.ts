import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { onStart } from '@trpc12/trpc/middleware';
import { experimental_generateOpenApi } from '@trpc12/trpc/openapi';
import {
  createFetchHandler,
  initTrpc,
  isTrpcError,
  lazy,
  type AnyRouter,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const seen: string[] = [];
const logged = t.procedure.use(onStart((opts) => void seen.push(opts.path)));

const router = t.router({
  post: {
    byId: logged
      .input(z.object({ id: z.string() }))
      .query((opts) => ({ id: opts.input.id })),
    create: logged
      .input(z.object({ title: z.string() }))
      .mutation((opts) => opts.input.title),
    onAdd: t.procedure.subscription(async function* () {
      yield 'added';
    }),
  },
  later: lazy(async () => ({ inner: t.procedure.query(() => 'loaded') })),
});
type AppRouter = typeof router;

/** A client whose `httpLink` calls `handler.fetch`, recording each URL path. */
const clientFor = (
  handler: { fetch: (request: Request) => Promise<Response> },
  link: { experimental_pathSeparator?: string; batch?: boolean } = {},
) => {
  const urls: string[] = [];
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [
      httpLink({
        url: 'http://localhost/trpc',
        ...link,
        fetch: (url, init) => {
          urls.push(new URL(url).pathname);
          return handler.fetch(new Request(url, init));
        },
      }),
    ],
  });
  return { client, urls };
};

const separated = (router: AnyRouter, separator = '/') =>
  createFetchHandler({
    router,
    batch: true,
    experimental_pathSeparator: separator,
  });

test('with a separator, URLs join path segments with it and nothing else changes', async () => {
  seen.length = 0;
  const calls: string[] = [];
  await using handler = createFetchHandler({
    router,
    experimental_pathSeparator: '/',
    createContext: (opts) => {
      calls.push(...opts.info.calls.map((call) => call.path));
      return {};
    },
  });
  const linked = clientFor(handler, {
    experimental_pathSeparator: '/',
  });

  expect(await linked.client.post.byId.query({ id: '1' })).toEqual({ id: '1' });
  expect(await linked.client.post.create.mutate({ title: 'Hi' })).toBe('Hi');
  const events: string[] = [];
  for await (const event of linked.client.post.onAdd.subscribe())
    events.push(event);
  expect(await linked.client.later.inner.query()).toBe('loaded');

  expect(events).toEqual(['added']);
  expect(linked.urls).toEqual([
    '/trpc/post/byId',
    '/trpc/post/create',
    '/trpc/post/onAdd',
    '/trpc/later/inner',
  ]);
  // Middleware and `createContext` see dotted paths, as without the option.
  expect(seen).toEqual(['post.byId', 'post.create']);
  expect(calls).toEqual([
    'post.byId',
    'post.create',
    'post.onAdd',
    'later.inner',
  ]);
});

test.each(['_', '~', ':', '--'])(
  'the separator %j works end to end',
  async (separator) => {
    await using handler = separated(router, separator);
    const linked = clientFor(handler, {
      experimental_pathSeparator: separator,
    });
    expect(await linked.client.post.byId.query({ id: '1' })).toEqual({
      id: '1',
    });
    expect(linked.urls).toEqual([`/trpc/post${separator}byId`]);
  },
);

test('batches go to the endpoint with dotted paths in the body', async () => {
  await using handler = separated(router);
  const linked = clientFor(handler, {
    experimental_pathSeparator: '/',
    batch: true,
  });
  const [a, b] = await Promise.all([
    linked.client.post.byId.query({ id: '1' }),
    linked.client.post.byId.query({ id: '2' }),
  ]);
  expect([a, b]).toEqual([{ id: '1' }, { id: '2' }]);
  expect(linked.urls).toEqual(['/trpc']);
});

test('a handler with a separator still serves the dotted URL', async () => {
  await using handler = separated(router);
  const res = await handler.fetch(
    new Request('http://localhost/trpc/post.byId?input={"id":"1"}'),
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ json: { id: '1' } });
});

test('a client and handler with different separators get NOT_FOUND', async () => {
  await using handler = createFetchHandler({ router });
  const linked = clientFor(handler, { experimental_pathSeparator: '/' });
  const err = await linked.client.post.byId.query({ id: '1' }).catch((e) => e);
  expect(isTrpcError(err) && err.code).toBe('NOT_FOUND');
  expect(String(err.message)).toContain('post/byId');
});

test('a router key holding the separator is refused, since two paths would share a URL', () => {
  const clashing = t.router({
    get_user: t.procedure.query(() => 'one'),
    get: { user: t.procedure.query(() => 'two') },
  });
  expect(() => separated(clashing, '_')).toThrow(
    'Router key "get_user": experimental_pathSeparator "_" separates path segments in URLs',
  );
  // Without the option, `_` is an ordinary character.
  expect(() => createFetchHandler({ router: clashing })).not.toThrow();
});

test('a lazy subtree holding the separator fails its first URL call, not another procedure', async () => {
  await using handler = separated(
    t.router({
      admin: lazy(async () => ({
        get_user: t.procedure.query(() => 'one'),
        get: { user: t.procedure.query(() => 'two') },
      })),
    }),
    '_',
  );
  const res = await handler.fetch(
    new Request('http://localhost/trpc/admin_get_user'),
  );
  expect(res.status).toBe(500);
});

test.each(['', '.x', 'a', '?', '#', '%2F', ' ', '\\'])(
  'the separator %j is refused by the handler and the link',
  (separator) => {
    expect(() =>
      createFetchHandler({ router, experimental_pathSeparator: separator }),
    ).toThrow("can't separate URL path segments");
    expect(() =>
      httpLink({
        url: 'http://localhost/trpc',
        experimental_pathSeparator: separator,
      }),
    ).toThrow("can't separate URL path segments");
  },
);

test("the RPC document's paths use the separator; operation ids stay dotted", () => {
  const doc = experimental_generateOpenApi(router, {
    info: { title: 'RPC', version: '1.0.0' },
    target: 'rpc',
    experimental_pathSeparator: '/',
  });
  expect(Object.keys(doc.paths)).toContain('/trpc/post/byId');
  expect(doc.paths['/trpc/post/byId']!['get']).toMatchObject({
    operationId: 'post.byId',
  });
});
