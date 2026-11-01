import { Effect } from 'effect';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { experimental_toContract } from '@trpc12/trpc/contract';
import {
  getProcedure,
  resolveProcedure,
  routerMetaOf,
} from '@trpc12/trpc/extend';
import {
  experimental_createOpenApiHandler,
  experimental_generateOpenApi,
  experimental_openapi,
} from '@trpc12/trpc/openapi';
import {
  createFetchHandler,
  createRouterClient,
  initTrpc,
  isLazy,
  lazy,
  loadRouter,
  mergeRouters,
  type AnyRouter,
  type inferRouterInputs,
} from '@trpc12/trpc/server';
import { createTestServer } from '../../fixtures/server.ts';
import { loadRouterEffect } from './router.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc().concat(experimental_openapi());

const users = t.procedure.query(() => ['ada']);
const ban = t.procedure
  .input(z.object({ id: z.string() }))
  .meta({ route: { method: 'POST', path: '/bans/{id}', tags: ['moderation'] } })
  .mutation((opts) => `banned ${opts.input.id}`);

const makeRouter = () => {
  const loads = { admin: 0, reports: 0, billing: 0 };
  return {
    router: t.router({
      health: t.procedure.query(() => 'ok'),
      admin: t.router(
        { meta: { route: { prefix: '/admin', tags: ['admin'] } } },
        {
          users,
          ban,
          audit: t.router(
            { meta: { route: { tags: ['audit'] } } },
            { log: users },
          ),
        },
      ),
      reports: t.lazy(
        async () => {
          loads.reports++;
          return { default: { daily: t.procedure.query(() => 'daily') } };
        },
        { meta: { route: { prefix: '/reports' } } },
      ),
      billing: lazy(async () => {
        loads.billing++;
        return {
          invoice: t.procedure
            .input(z.object({ n: z.number() }))
            .query((opts) => opts.input.n * 2),
        };
      }),
    }),
    loads,
  };
};

test('router-level route meta only changes OpenAPI routes (08 Q8.3)', async () => {
  const { router } = makeRouter();
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.admin.users.query()).toEqual(['ada']);
  expect(await client.admin.audit.log.query()).toEqual(['ada']);

  const doc = experimental_generateOpenApi(await loadRouter(router), {
    info: { title: 'x', version: '1' },
  });
  expect(doc.paths['/api/admin/users']!['get']!.tags).toEqual(['admin']);
  expect(doc.paths['/api/admin/bans/{id}']!['post']!.tags).toEqual([
    'admin',
    'moderation',
  ]);
  expect(doc.paths['/api/admin/audit/log']!['get']!.tags).toEqual([
    'admin',
    'audit',
  ]);
  expect(doc.paths['/api/reports/daily']).toBeDefined();
  expect(doc.paths['/api/billing/invoice']).toBeDefined();
});

test('lazy() loads a subtree on its first call, once (08 Q8.4)', async () => {
  const app = makeRouter();
  const { router } = app;
  expect(isLazy(router.reports)).toBe(true);
  expect(getProcedure(router, 'reports.daily')).toBeUndefined();

  await using server = await createTestServer({ router, batch: true });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url, batch: true })],
  });
  expectTypeOf<
    Parameters<typeof client.billing.invoice.query>[0]
  >().toEqualTypeOf<{ n: number }>();
  const [a, b, c] = await Promise.all([
    client.reports.daily.query(),
    client.reports.daily.query(),
    client.billing.invoice.query({ n: 21 }),
  ]);
  expect([a, b, c]).toEqual(['daily', 'daily', 42]);
  expect(app.loads).toMatchObject({ reports: 1, billing: 1 });
  expect(getProcedure(router, 'reports.daily')).toBeDefined();

  const caller = createRouterClient(makeRouter().router);
  expect(await caller.billing.invoice.query({ n: 2 })).toBe(4);
});

test('tools that need the whole router ask for loadRouter()', async () => {
  const app = makeRouter();
  expect(() =>
    experimental_generateOpenApi(app.router, {
      info: { title: 'x', version: '1' },
    }),
  ).toThrow(
    /"reports" is lazy and hasn't loaded: pass `await loadRouter\(router\)`/,
  );
  const contract = experimental_toContract(await loadRouter(app.router));
  expect(contract.procedures['admin.users']!.route).toMatchObject({
    path: '/admin/users',
    tags: ['admin'],
  });
});

const get = (
  handler: { fetch: (r: Request) => Promise<Response> },
  path: string,
) => handler.fetch(new Request(`http://localhost/api${path}`));

test('the OpenAPI handler loads a prefixed lazy subtree on a request under it', async () => {
  const app = makeRouter();
  const handler = experimental_createOpenApiHandler({ router: app.router });
  expect(await (await get(handler, '/admin/users')).json()).toEqual(['ada']);
  await (await get(handler, '/billing/invoice?n=1')).json();
  expect(app.loads).toMatchObject({ reports: 0, billing: 1 });
  expect(await (await get(handler, '/reports/daily')).json()).toBe('daily');
  expect(app.loads.reports).toBe(1);
  expect((await get(handler, '/reports/nope')).status).toBe(404);
});

test('with a contract, the OpenAPI handler loads lazy subtrees only when called', async () => {
  const contract = experimental_toContract(
    await loadRouter(makeRouter().router),
  );
  const app = makeRouter();
  const handler = experimental_createOpenApiHandler({
    router: app.router,
    contract,
  });
  expect(await (await get(handler, '/admin/users')).json()).toEqual(['ada']);
  expect(app.loads).toMatchObject({ reports: 0, billing: 0 });
  expect(await (await get(handler, '/billing/invoice?n=4')).json()).toBe(8);
  expect(app.loads).toMatchObject({ reports: 0, billing: 1 });
});

test('router-level meta takes only the keys an extension gives a router form', () => {
  const app = initTrpc<{ meta: { auth?: 'admin' } }>().concat(
    experimental_openapi(),
  );
  app.router({ meta: { route: { prefix: '/a', tags: ['a'] } } }, { users });
  // @ts-expect-error -- `auth` applies to procedures only
  app.router({ meta: { auth: 'admin' } }, { users });
  // @ts-expect-error -- a router's `route` is `{ prefix, tags }`
  app.router({ meta: { route: { method: 'GET' } } }, { users });
  // @ts-expect-error -- no `route` meta without experimental_openapi()
  initTrpc().router({ meta: { route: { prefix: '/a' } } }, { users });
});

const openApiPaths = (router: AnyRouter) =>
  Object.keys(
    experimental_generateOpenApi(router, { info: { title: 'x', version: '1' } })
      .paths,
  );

test("mergeRouters keeps a router's meta for everything merged with it", async () => {
  const admin = t.router(
    { meta: { route: { prefix: '/admin', tags: ['admin'] } } },
    { users },
  );
  const merged = mergeRouters(admin, { health: users });
  expect(Object.keys(merged)).toEqual(['users', 'health']);
  expect(routerMetaOf(merged)).toEqual({
    route: { prefix: '/admin', tags: ['admin'] },
  });

  const router = t.router({ api: merged, root: users });
  expect(openApiPaths(router)).toEqual([
    '/api/admin/users',
    '/api/admin/health',
    '/api/root',
  ]);
  const handler = experimental_createOpenApiHandler({ router });
  expect(await (await get(handler, '/admin/health')).json()).toEqual(['ada']);
  expect(
    experimental_toContract(router).procedures['api.users']!.route,
  ).toMatchObject({ path: '/admin/users', tags: ['admin'] });

  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.api.health.query()).toEqual(['ada']);

  expect(mergeRouters({ a: users }, { b: users })).not.toHaveProperty('~meta');
});

test("a root router's own route meta applies to every route", async () => {
  const admin = t.router(
    { meta: { route: { prefix: '/admin', tags: ['admin'] } } },
    { users, ban },
  );
  expect(openApiPaths(admin)).toEqual([
    '/api/admin/users',
    '/api/admin/bans/{id}',
  ]);
  expect(openApiPaths(mergeRouters(admin, { health: users }))).toEqual([
    '/api/admin/users',
    '/api/admin/bans/{id}',
    '/api/admin/health',
  ]);
  const handler = experimental_createOpenApiHandler({ router: admin });
  expect(await (await get(handler, '/admin/users')).json()).toEqual(['ada']);
  expect((await get(handler, '/users')).status).toBe(404);
});

test('mergeRouters throws when routers set a meta key to different values', () => {
  const admin = t.router(
    { meta: { route: { prefix: '/admin' } } },
    { users, ban },
  );
  const billing = t.router(
    { meta: { route: { prefix: '/billing' } } },
    { invoices: users },
  );
  expect(() => mergeRouters(admin, { health: users }, billing)).toThrow(
    'mergeRouters: routers 1 ({ users, ban }) and 3 ({ invoices }) set router meta "route" to different values ({"prefix":"/admin"} and {"prefix":"/billing"}); nest them under keys of their own instead ({ a: …, b: … }), so each keeps its meta',
  );
  const tagged = t.router(
    { meta: { route: { prefix: '/admin', tags: ['x'] } } },
    { invoices: users },
  );
  expect(() => mergeRouters(admin, tagged)).toThrow('router meta "route"');
  expect(openApiPaths({ admin, billing })).toEqual([
    '/api/admin/users',
    '/api/admin/bans/{id}',
    '/api/billing/invoices',
  ]);
});

test('mergeRouters accepts routers whose meta is equal, and nests', () => {
  const group = <const R extends AnyRouter>(routes: R) =>
    t.router(
      { meta: { route: { prefix: '/admin', tags: ['admin'] } } },
      routes,
    );
  const inner = mergeRouters(group({ users }), { health: users });
  const merged = mergeRouters(inner, group({ ban }), { stats: users });
  expect(routerMetaOf(merged)).toEqual({
    route: { prefix: '/admin', tags: ['admin'] },
  });
  expect(openApiPaths({ v1: merged })).toEqual([
    '/api/admin/users',
    '/api/admin/health',
    '/api/admin/bans/{id}',
    '/api/admin/stats',
  ]);
  expect(() =>
    mergeRouters(merged, t.router({ meta: { route: { prefix: '/x' } } }, {})),
  ).toThrow('router meta "route"');
  expectTypeOf<inferRouterInputs<typeof merged>['ban']>().toEqualTypeOf<{
    id: string;
  }>();
});

test('lazy() takes a module with a default export or the router itself', async () => {
  const fromModule = lazy(async () => ({ default: { a: users } }));
  const direct = lazy(async () => ({ a: users }));
  const router: AnyRouter = { fromModule, direct };
  const loaded = await loadRouter(router);
  expect(getProcedure(loaded, 'fromModule.a')).toBe(users);
  expect(getProcedure(loaded, 'direct.a')).toBe(users);
});

test('concurrent first calls share one load; then resolveProcedure needs no wait', async () => {
  let loads = 0;
  const router: AnyRouter = {
    nested: {
      deep: lazy(async () => {
        loads++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { inner: lazy(async () => ({ a: users })) };
      }),
    },
  };
  const [a, b, all] = await Promise.all([
    Effect.runPromise(resolveProcedure(router, 'nested.deep.inner.a')),
    Effect.runPromise(resolveProcedure(router, 'nested.deep.inner.a')),
    loadRouter(router),
  ]);
  expect([a, b]).toEqual([users, users]);
  expect(all).toBe(router);
  expect(loads).toBe(1);
  expect(Effect.runSync(resolveProcedure(router, 'nested.deep.inner.a'))).toBe(
    users,
  );
  expect(
    Effect.runSync(resolveProcedure(router, 'nested.deep.missing')),
  ).toBeUndefined();
});

test("a failed load stays failed, a defect with the loader's error", async () => {
  let loads = 0;
  const failure = new Error('chunk failed to load');
  const router: AnyRouter = {
    broken: lazy(async () => {
      loads++;
      throw failure;
    }),
  };
  await expect(
    Effect.runPromise(resolveProcedure(router, 'broken.a')),
  ).rejects.toBe(failure);
  await expect(loadRouter(router)).rejects.toBe(failure);
  expect(loads).toBe(1);
});

test('loadRouterEffect loads every lazy subtree as an Effect', async () => {
  const router: AnyRouter = { admin: lazy(async () => ({ users })) };
  expect(
    await Effect.runPromise(resolveProcedure(router, 'admin.nope')),
  ).toBeUndefined();
  expect(await Effect.runPromise(loadRouterEffect(router))).toBe(router);
});

test('a router key no client can call is an error when it is served', async () => {
  const q = t.procedure.query(() => 1);
  const withKey = (key: string, node: AnyRouter[string]): AnyRouter =>
    Object.fromEntries([[key, node]]);
  expect(() =>
    createFetchHandler({ router: t.router({ post: withKey('then', q) }) }),
  ).toThrow('Router key "post.then": "then" is reserved');
  expect(() => createRouterClient(t.router({ 'post.byId': q }))).toThrow(
    'Router key "post.byId": "." separates path segments',
  );
  const router: AnyRouter = { admin: lazy(async () => withKey('then', q)) };
  await expect(
    Effect.runPromise(resolveProcedure(router, 'admin.then')),
  ).rejects.toThrow('Router key "then"');
  expect(() =>
    createFetchHandler({
      router: t.router({ call: q, apply: q, nested: { thenable: q } }),
    }),
  ).not.toThrow();
});
