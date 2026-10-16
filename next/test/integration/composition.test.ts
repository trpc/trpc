import { createTrpcClient, httpLink, safe } from 'trpcdev/client';
import {
  createRouterClient,
  error,
  initTrpc,
  mergeRouters,
  middleware,
  type inferRouterContext,
  type inferRouterInputs,
  type inferRouterOutputs,
} from 'trpcdev/server';
import { createTestServer } from './fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

// --- a plugin package: its own `t`, whose ctx is what it requires --------------------

interface Db {
  log: string[];
}

const plugin = initTrpc<{ ctx: { db: Db }; meta: { audit?: string } }>();

export const audited = plugin.procedure
  .input(z.object({ orgId: z.string() }))
  .use(({ ctx, input, meta, next }) => {
    if (input.orgId === 'banned') {
      return error({ code: 'FORBIDDEN', data: { orgId: input.orgId } });
    }
    return next({
      ctx: {
        audit: (what: string) =>
          ctx.db.log.push(`${meta.audit ?? '?'}:${input.orgId}:${what}`),
      },
    });
  });

export const requireUser = middleware<{ ctx: { user: string | null } }>()(
  ({ ctx, next }) =>
    ctx.user
      ? next({ ctx: { user: ctx.user } })
      : error({ code: 'UNAUTHORIZED' }),
);

// --- the app -------------------------------------------------------------------------

interface Context {
  db: Db;
  user: string | null;
  plan: 'free' | 'pro';
}
const t = initTrpc<{ ctx: Context; meta: { audit?: string } }>();

const projectRouter = {
  rename: t.procedure
    .use(requireUser)
    .concat(audited)
    .meta({ audit: 'rename' })
    .input(z.object({ name: z.string() }))
    .mutation(({ ctx, input }) => {
      ctx.audit(input.name);
      return { orgId: input.orgId, name: input.name, by: ctx.user };
    }),
};

const searchRouter = {
  search: t.procedure
    .input(({ ctx }) =>
      z.object({
        q: z.string(),
        limit: z
          .number()
          .max(ctx.plan === 'pro' ? 100 : 10)
          .default(5),
      }),
    )
    .query(({ input }) => ({ q: input.q, limit: input.limit })),
};

const router = mergeRouters(projectRouter, searchRouter, {
  nested: { deep: { ping: t.procedure.query(() => 'pong' as const) } },
});
type AppRouter = typeof router;

async function setup(ctxOverrides: Partial<Context> = {}) {
  const db: Db = { log: [] };
  const server = await createTestServer({
    router,
    createContext: (): Context => ({
      db,
      user: 'alex',
      plan: 'free',
      ...ctxOverrides,
    }),
  });
  const client = createTrpcClient<AppRouter>({
    links: [httpLink({ url: server.url })],
  });
  return { db, server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('a plugin from another `t` adds ctx, input, meta-aware behavior and errors', async () => {
  await using ctx = await setup();
  const result = await ctx.client.rename.mutate({ orgId: 'acme', name: 'New' });
  expect(result).toEqual({ orgId: 'acme', name: 'New', by: 'alex' });
  expect(ctx.db.log).toEqual(['rename:acme:New']);

  expectTypeOf<inferRouterInputs<AppRouter>['rename']>().toEqualTypeOf<{
    orgId: string;
    name: string;
  }>();
  expectTypeOf<inferRouterOutputs<AppRouter>['rename']>().toEqualTypeOf<{
    orgId: string;
    name: string;
    by: string;
  }>();
});

test("a plugin's returned errors join the procedure's error union", async () => {
  await using ctx = await setup();
  const [, err] = await safe(
    ctx.client.rename.mutate({ orgId: 'banned', name: 'x' }),
  );
  expect(err).toMatchObject({ code: 'FORBIDDEN', defined: true });
  if (err?.defined) {
    expectTypeOf(err.code).toEqualTypeOf<
      'FORBIDDEN' | 'UNAUTHORIZED' | 'BAD_REQUEST'
    >();
    if (err.code === 'FORBIDDEN') expect(err.data.orgId).toBe('banned');
  }
});

test('a standalone middleware works with any `t` whose ctx fits', async () => {
  await using ctx = await setup({ user: null });
  const [, err] = await safe(
    ctx.client.rename.mutate({ orgId: 'acme', name: 'x' }),
  );
  expect(err).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  expect(ctx.db.log).toEqual([]);
});

test('concat checks the ctx a plugin requires', () => {
  const other = initTrpc<{ ctx: { user: string } }>();
  // @ts-expect-error -- `db` is missing from this ctx
  other.procedure.concat(audited);

  const withDb = other.procedure.use(({ next }) =>
    next({ ctx: { db: { log: [] } } }),
  );
  withDb.concat(audited);
});

test('a context-aware input validates against the caller', async () => {
  await using free = await setup({ plan: 'free' });
  expect(await free.client.search.query({ q: 'x' })).toEqual({
    q: 'x',
    limit: 5,
  });
  const [, err] = await safe(free.client.search.query({ q: 'x', limit: 50 }));
  expect(err).toMatchObject({ code: 'BAD_REQUEST' });

  await using pro = await setup({ plan: 'pro' });
  expect(await pro.client.search.query({ q: 'x', limit: 50 })).toEqual({
    q: 'x',
    limit: 50,
  });
});

test('mergeRouters keeps nested routers addressable by dotted paths', async () => {
  await using ctx = await setup();
  expect(await ctx.client.nested.deep.ping.query()).toBe('pong');
  expect(new URL(ctx.server.requests.at(-1)!.url).pathname).toBe(
    '/trpc/nested.deep.ping',
  );
});

test('mergeRouters rejects duplicate keys at the type level and at runtime', () => {
  const a = { ping: t.procedure.query(() => 1) };
  const b = { ping: t.procedure.query(() => 2) };
  // @ts-expect-error -- `ping` is in both routers
  expect(() => mergeRouters(a, b)).toThrow('duplicate key "ping"');
});

test('procedures cannot be reached through prototype keys', async () => {
  await using ctx = await setup();
  for (const path of ['constructor', '__proto__', 'nested.toString']) {
    const res = await fetch(`${ctx.server.url}/${path}`);
    expect(res.status).toBe(404);
  }
});

const withTenant = middleware<{ ctx: { tenant: string } }>()(({ ctx, next }) =>
  next({ ctx: { scope: `tenant:${ctx.tenant}` } }),
);
const effectTenant = middleware.effect<{ ctx: { tenant: string } }>()(
  ({ ctx, next }) => next({ ctx: { region: ctx.tenant.slice(0, 2) } }),
);

test('ctx a standalone middleware needs and the procedure lacks becomes a root ctx requirement', async () => {
  const bare = initTrpc();
  const tenantRouter = {
    whoami: bare.procedure
      .use(withTenant)
      .use(effectTenant)
      .query(({ ctx }) => `${ctx.scope}/${ctx.region}`),
  };
  expectTypeOf<inferRouterContext<typeof tenantRouter>>().toEqualTypeOf<{
    tenant: string;
  }>();

  // @ts-expect-error -- the router now needs { tenant } in ctx
  createRouterClient(tenantRouter);
  const caller = createRouterClient(tenantRouter, { ctx: { tenant: 'eu-1' } });
  expect(await caller.whoami.query()).toBe('tenant:eu-1/eu');

  await using server = await createTestServer({
    router: tenantRouter,
    createContext: () => ({ tenant: 'us-2' }),
  });
  const client = createTrpcClient<typeof tenantRouter>({
    links: [httpLink({ url: server.url })],
  });
  expect(await client.whoami.query()).toBe('tenant:us-2/us');

  // The procedure has `user`, but nullable: that's a conflict, not a requirement.
  const strict = middleware<{ ctx: { user: string } }>()(({ next }) => next());
  // @ts-expect-error -- `user` is `string | null` here
  t.procedure.use(strict);
  t.procedure.use(requireUser).use(strict);
});
