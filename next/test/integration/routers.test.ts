import { createTrpcClient, httpLink, routerType } from 'trpcdev/client';
import { toContract } from 'trpcdev/contract';
import { getProcedure } from 'trpcdev/extend';
import { createOpenApiHandler, generateOpenApi } from 'trpcdev/openapi';
import {
  createRouterClient,
  initTrpc,
  isLazy,
  lazy,
  loadRouter,
  type AnyRouter,
} from 'trpcdev/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

const t = initTrpc();

const users = t.procedure.query(() => ['alex']);
const ban = t.procedure
  .input(z.object({ id: z.string() }))
  .route({ method: 'POST', path: '/bans/{id}', tags: ['moderation'] })
  .mutation(({ input }) => `banned ${input.id}`);

const makeRouter = () => {
  const loads = { admin: 0, reports: 0, billing: 0 };
  const router = {
    health: t.procedure.query(() => 'ok'),
    admin: t.router(
      { prefix: '/admin', tags: ['admin'] },
      { users, ban, audit: t.router({ tags: ['audit'] }, { log: users }) },
    ),
    reports: lazy(
      async () => {
        loads.reports++;
        return { default: { daily: t.procedure.query(() => 'daily') } };
      },
      { prefix: '/reports' },
    ),
    billing: lazy(async () => {
      loads.billing++;
      return {
        invoice: t.procedure
          .input(z.object({ n: z.number() }))
          .query(({ input }) => input.n * 2),
      };
    }),
  };
  return { router, loads };
};

test('t.router({ prefix, tags }) only changes OpenAPI routes (08 Q8.3)', async () => {
  const { router } = makeRouter();
  await using server = await createTestServer({ router });
  const client = createTrpcClient({
    router: routerType<typeof router>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.admin.users.query()).toEqual(['alex']);
  expect(await client.admin.audit.log.query()).toEqual(['alex']);

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
  const { router, loads } = makeRouter();
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
  expect(loads).toMatchObject({ reports: 1, billing: 1 });
  expect(getProcedure(router, 'reports.daily')).toBeDefined();

  const caller = createRouterClient(makeRouter().router);
  expect(await caller.billing.invoice.query({ n: 2 })).toBe(4);
});

test('tools that need the whole router ask for loadRouter()', async () => {
  const { router } = makeRouter();
  expect(() =>
    generateOpenApi(router, { info: { title: 'x', version: '1' } }),
  ).toThrow(
    /"reports" is lazy and hasn't loaded: pass `await loadRouter\(router\)`/,
  );
  const contract = toContract(await loadRouter(router));
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
  const { router, loads } = makeRouter();
  const handler = createOpenApiHandler({ router });
  expect(await (await get(handler, '/admin/users')).json()).toEqual(['alex']);
  await (await get(handler, '/billing/invoice?n=1')).json();
  expect(loads).toMatchObject({ reports: 0, billing: 1 });
  expect(await (await get(handler, '/reports/daily')).json()).toBe('daily');
  expect(loads.reports).toBe(1);
  expect((await get(handler, '/reports/nope')).status).toBe(404);
});

test('with a contract, the OpenAPI handler loads lazy subtrees only when called', async () => {
  const contract = toContract(await loadRouter(makeRouter().router));
  const { router, loads } = makeRouter();
  const handler = createOpenApiHandler({ router, contract });
  expect(await (await get(handler, '/admin/users')).json()).toEqual(['alex']);
  expect(loads).toMatchObject({ reports: 0, billing: 0 });
  expect(await (await get(handler, '/billing/invoice?n=4')).json()).toBe(8);
  expect(loads).toMatchObject({ reports: 0, billing: 1 });
});

test('lazy() takes a module with a default export or the router itself', async () => {
  const fromModule = lazy(async () => ({ default: { a: users } }));
  const direct = lazy(async () => ({ a: users }));
  const router: AnyRouter = { fromModule, direct };
  const loaded = await loadRouter(router);
  expect(getProcedure(loaded, 'fromModule.a')).toBe(users);
  expect(getProcedure(loaded, 'direct.a')).toBe(users);
});
