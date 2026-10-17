import {
  createTrpcClient,
  httpLink,
  safe,
  routerType,
} from '@trpc12/trpc/client';
import {
  type AnyRouter,
  createRouterClient,
  error,
  initTrpc,
  mergeRouters,
  middleware,
  type inferRouterContext,
  type inferRouterInputs,
  type inferRouterOutputs,
} from '@trpc12/trpc/server';
import { Context, Effect } from 'effect';
import { createTestServer } from '../fixtures/server.ts';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';

// --- a plugin package: its own `t`, whose ctx is what it requires --------------------

interface Db {
  log: string[];
}

const plugin = initTrpc<{ ctx: { db: Db }; meta: { audit?: string } }>();

export const audited = plugin.procedure
  .input(z.object({ orgId: z.string() }))
  .use((opts) => {
    const { input } = opts;
    if (input.orgId === 'banned') {
      return error({ code: 'FORBIDDEN', data: { orgId: input.orgId } });
    }
    return opts.next({
      ctx: {
        audit: (what: string) =>
          opts.ctx.db.log.push(
            `${opts.meta.audit ?? '?'}:${input.orgId}:${what}`,
          ),
      },
    });
  });

export const requireUser = middleware<{ ctx: { user: string | null } }>()(
  (opts) =>
    opts.ctx.user
      ? opts.next({ ctx: { user: opts.ctx.user } })
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
    .mutation((opts) => {
      const { input } = opts;
      opts.ctx.audit(input.name);
      return { orgId: input.orgId, name: input.name, by: opts.ctx.user };
    }),
} satisfies AnyRouter;

const searchRouter = {
  search: t.procedure
    .input((opts) =>
      z.object({
        q: z.string(),
        limit: z
          .number()
          .max(opts.ctx.plan === 'pro' ? 100 : 10)
          .default(5),
      }),
    )
    .query((opts) => ({ q: opts.input.q, limit: opts.input.limit })),
} satisfies AnyRouter;

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
      user: 'ada',
      plan: 'free',
      ...ctxOverrides,
    }),
  });
  const client = createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: server.url })],
  });
  return { db, server, client, [Symbol.asyncDispose]: () => server.close() };
}

test('a plugin from another `t` adds ctx, input, meta-aware behavior and errors', async () => {
  await using ctx = await setup();
  const result = await ctx.client.rename.mutate({ orgId: 'acme', name: 'New' });
  expect(result).toEqual({ orgId: 'acme', name: 'New', by: 'ada' });
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
  expect(err).toMatchObject({ code: 'UNAUTHORIZED' });
  expect(ctx.db.log).toEqual([]);
});

test('concat checks the ctx a plugin requires', () => {
  const other = initTrpc<{ ctx: { user: string } }>();
  // @ts-expect-error -- `db` is missing from this ctx
  other.procedure.concat(audited);

  const withDb = other.procedure.use((opts) =>
    opts.next({ ctx: { db: { log: [] } } }),
  );
  withDb.concat(audited);
});

test('concat runs the leading middleware an app and a plugin share once', async () => {
  const calls: string[] = [];
  const session = middleware<{ ctx: { user: string | null } }>()((opts) => {
    calls.push('session');
    return opts.next({ ctx: { session: opts.ctx.user ?? 'anon' } });
  });
  const pluginT = initTrpc<{ ctx: { user: string | null } }>();
  const tagged = pluginT.procedure.use(session).use((opts) => {
    calls.push('plugin');
    return opts.next({ ctx: { tag: opts.ctx.session } });
  });
  const caller = createRouterClient(
    {
      shared: t.procedure
        .use(session)
        .concat(tagged)
        .query((opts) => opts.ctx.tag),
      reordered: t.procedure
        .use((opts) => {
          calls.push('log');
          return opts.next();
        })
        .use(session)
        .concat(tagged)
        .query((opts) => opts.ctx.tag),
    },
    {
      ctx: { db: { log: [] }, user: 'ada', plan: 'free' },
    },
  );

  expect(await caller.shared.query()).toBe('ada');
  expect(calls).toEqual(['session', 'plugin']);

  calls.length = 0;
  expect(await caller.reordered.query()).toBe('ada');
  expect(calls).toEqual(['log', 'session', 'session', 'plugin']);
});

test('concat shares leading inputs and provides only when they are the same', async () => {
  class Tenant extends Context.Service<Tenant, { name: string }>()('Tenant') {}
  const calls: string[] = [];
  const Org = z
    .object({ orgId: z.string() })
    .transform((v) => (calls.push('input'), v));
  const makeTenant = () => (calls.push('tenant'), { name: 'acme' });
  const pluginT = initTrpc<{ ctx: { user: string | null } }>();
  const tenantName = () =>
    Effect.map(Effect.service(Tenant), (tenant) => tenant.name);

  const plugin = pluginT.procedure.input(Org).provide(Tenant, makeTenant);
  const r = {
    shared: t.procedure
      .input(Org)
      .provide(Tenant, makeTenant)
      .concat(plugin)
      .query(tenantName),
    otherInput: t.procedure
      .input(z.object({ orgId: z.string() }))
      .concat(plugin)
      .query(tenantName),
    otherKind: t.procedure
      .input(Org)
      .concat(pluginT.procedure.provide(Tenant, makeTenant))
      .query(tenantName),
    otherMake: t.procedure
      .provide(Tenant, () => ({ name: 'other' }))
      .concat(plugin)
      .query(tenantName),
    provideThenUse: t.procedure
      .provide(Tenant, makeTenant)
      .concat(pluginT.procedure.use((opts) => opts.next()))
      .query(tenantName),
  };
  const caller = createRouterClient(r, {
    ctx: { db: { log: [] }, user: 'ada', plan: 'free' },
  });
  const run = async (name: keyof typeof r) => {
    calls.length = 0;
    const result = await caller[name].query({ orgId: 'o' } as never);
    return { result, calls: [...calls] };
  };
  expect(await run('shared')).toEqual({
    result: 'acme',
    calls: ['input', 'tenant'],
  });
  expect(await run('otherInput')).toEqual({
    result: 'acme',
    calls: ['input', 'tenant'],
  });
  expect(await run('otherKind')).toEqual({
    result: 'acme',
    calls: ['input', 'tenant'],
  });
  expect(await run('otherMake')).toEqual({
    result: 'acme',
    calls: ['input', 'tenant'],
  });
  expect(await run('provideThenUse')).toEqual({
    result: 'acme',
    calls: ['tenant'],
  });
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
  const a = { ping: t.procedure.query(() => 1) } satisfies AnyRouter;
  const b = { ping: t.procedure.query(() => 2) } satisfies AnyRouter;
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

const withTenant = middleware<{ ctx: { tenant: string } }>()((opts) =>
  opts.next({ ctx: { scope: `tenant:${opts.ctx.tenant}` } }),
);
const effectTenant = middleware.effect<{ ctx: { tenant: string } }>()((opts) =>
  opts.next({ ctx: { region: opts.ctx.tenant.slice(0, 2) } }),
);

test('ctx a standalone middleware needs and the procedure lacks becomes a root ctx requirement', async () => {
  const bare = initTrpc();
  const tenantRouter = {
    whoami: bare.procedure
      .use(withTenant)
      .use(effectTenant)
      .query((opts) => `${opts.ctx.scope}/${opts.ctx.region}`),
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
  const client = createTrpcClient({
    router: routerType<typeof tenantRouter>(),
    links: [httpLink({ url: server.url })],
  });
  expect(await client.whoami.query()).toBe('tenant:us-2/us');

  // The procedure has `user`, but nullable: that's a conflict, not a requirement.
  const strict = middleware<{ ctx: { user: string } }>()((opts) => opts.next());
  // @ts-expect-error -- `user` is `string | null` here
  t.procedure.use(strict);
  t.procedure.use(requireUser).use(strict);
});
