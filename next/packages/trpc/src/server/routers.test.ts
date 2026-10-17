import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { toContract } from '@trpc12/trpc/contract';
import { getProcedure } from '@trpc12/trpc/extend';
import {
  createOpenApiHandler,
  generateOpenApi,
  openapi,
} from '@trpc12/trpc/openapi';
import {
  createRouterClient,
  initTrpc,
  isLazy,
  lazy,
  loadRouter,
  type AnyRouter,
} from '@trpc12/trpc/server';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc().concat(openapi());

const users = t.procedure.query(() => ['ada']);
const ban = t.procedure
  .input(z.object({ id: z.string() }))
  .meta({ route: { method: 'POST', path: '/bans/{id}', tags: ['moderation'] } })
  .mutation((opts) => `banned ${opts.input.id}`);

const makeRouter = () => {
  const loads = { admin: 0, reports: 0, billing: 0 };
  return {
    router: {
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
    },
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

  const doc = generateOpenApi(await loadRouter(router), {
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
    generateOpenApi(app.router, { info: { title: 'x', version: '1' } }),
  ).toThrow(
    /"reports" is lazy and hasn't loaded: pass `await loadRouter\(router\)`/,
  );
  const contract = toContract(await loadRouter(app.router));
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
  const handler = createOpenApiHandler({ router: app.router });
  expect(await (await get(handler, '/admin/users')).json()).toEqual(['ada']);
  await (await get(handler, '/billing/invoice?n=1')).json();
  expect(app.loads).toMatchObject({ reports: 0, billing: 1 });
  expect(await (await get(handler, '/reports/daily')).json()).toBe('daily');
  expect(app.loads.reports).toBe(1);
  expect((await get(handler, '/reports/nope')).status).toBe(404);
});

test('with a contract, the OpenAPI handler loads lazy subtrees only when called', async () => {
  const contract = toContract(await loadRouter(makeRouter().router));
  const app = makeRouter();
  const handler = createOpenApiHandler({ router: app.router, contract });
  expect(await (await get(handler, '/admin/users')).json()).toEqual(['ada']);
  expect(app.loads).toMatchObject({ reports: 0, billing: 0 });
  expect(await (await get(handler, '/billing/invoice?n=4')).json()).toBe(8);
  expect(app.loads).toMatchObject({ reports: 0, billing: 1 });
});

test('router-level meta takes only the keys an extension gives a router form', () => {
  const app = initTrpc<{ meta: { auth?: 'admin' } }>().concat(openapi());
  app.router({ meta: { route: { prefix: '/a', tags: ['a'] } } }, { users });
  // @ts-expect-error -- `auth` applies to procedures only
  app.router({ meta: { auth: 'admin' } }, { users });
  // @ts-expect-error -- a router's `route` is `{ prefix, tags }`
  app.router({ meta: { route: { method: 'GET' } } }, { users });
  // @ts-expect-error -- no `route` meta without openapi()
  initTrpc().router({ meta: { route: { prefix: '/a' } } }, { users });
});

test('lazy() takes a module with a default export or the router itself', async () => {
  const fromModule = lazy(async () => ({ default: { a: users } }));
  const direct = lazy(async () => ({ a: users }));
  const router: AnyRouter = { fromModule, direct };
  const loaded = await loadRouter(router);
  expect(getProcedure(loaded, 'fromModule.a')).toBe(users);
  expect(getProcedure(loaded, 'direct.a')).toBe(users);
});
