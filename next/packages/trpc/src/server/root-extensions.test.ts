import { Context, Effect } from 'effect';
import {
  createTrpcClient,
  httpLink,
  safe,
  routerType,
} from '@trpc12/trpc/client';
import { contract } from '@trpc12/trpc/contract';
import { createRouterClient, error, initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { createTestServer } from '../fixtures/server.ts';

// --- a rate-limit package ------------------------------------------------------

interface RateLimitMeta {
  rateLimit?: { max: number };
}
const rateLimit = (opts: { max: number }) => {
  const seen = new Map<string, number>();
  const r = initTrpc<{ ctx: { ip: string }; meta: RateLimitMeta }>({
    defaultMeta: { rateLimit: { max: opts.max } },
  });
  return r.procedure
    .errors({ TOO_MANY_REQUESTS: {} })
    .use(({ ctx, meta, next }) => {
      const count = (seen.get(ctx.ip) ?? 0) + 1;
      seen.set(ctx.ip, count);
      if (count > (meta.rateLimit?.max ?? Infinity)) {
        return error({ code: 'TOO_MANY_REQUESTS' });
      }
      return next({ ctx: { requestCount: count } });
    });
};

// --- an audit package that provides an Effect service -------------------------

interface AuditLog {
  readonly _: unique symbol;
}
const AuditLog = Context.Service<AuditLog, { entries: string[] }>()(
  'test/AuditLog',
);
const audit = () => {
  const a = initTrpc<{ meta: { audit?: string } }>();
  const entries: string[] = [];
  return {
    entries,
    extension: a.procedure.provide(AuditLog, () => ({ entries })),
  };
};

// --- the app -------------------------------------------------------------------

const audited = audit();
const t = initTrpc<{ ctx: { ip: string; user: string | null } }>()
  .concat(rateLimit({ max: 2 }))
  .concat(audited.extension);

const authed = t.middleware(({ ctx, next }) => {
  expectTypeOf(ctx.requestCount).toEqualTypeOf<number>();
  return ctx.user
    ? next({ ctx: { user: ctx.user } })
    : error({ code: 'UNAUTHORIZED' });
});

const appRouter = {
  hello: t.procedure.query(({ ctx, meta }) => {
    expectTypeOf(meta).toEqualTypeOf<{
      rateLimit?: { max: number };
      audit?: string;
    }>();
    return { count: ctx.requestCount, max: meta.rateLimit?.max };
  }),
  strict: t.procedure
    .meta({ rateLimit: { max: 0 } })
    .query(() => 'never reached'),
  write: t.procedure
    .use(authed)
    .meta({ audit: 'write' })
    .mutation(({ ctx, meta }) =>
      Effect.gen(function* () {
        const log = yield* AuditLog;
        log.entries.push(`${ctx.user}:${meta.audit}`);
        return log.entries.length;
      }),
    ),
};

test('an extension adds ctx, meta, errors and middleware to every procedure (03 Q3.6)', async () => {
  await using server = await createTestServer({
    router: appRouter,
    createContext: ({ request }) => ({
      ip: request.headers['x-ip'] ?? 'local',
      user: request.headers['x-user'] ?? null,
    }),
  });
  const client = createTrpcClient({
    router: routerType<typeof appRouter>(),
    links: [httpLink({ url: server.url, headers: { 'x-ip': 'a' } })],
  });
  expect(await client.hello.query()).toEqual({ count: 1, max: 2 });
  expect(await client.hello.query()).toEqual({ count: 2, max: 2 });
  const [, err] = await safe(client.hello.query());
  expect(err).toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  if (err?.defined) {
    expectTypeOf(err.code).toEqualTypeOf<'TOO_MANY_REQUESTS'>();
  }

  const other = createTrpcClient({
    router: routerType<typeof appRouter>(),
    links: [
      httpLink({ url: server.url, headers: { 'x-ip': 'b', 'x-user': 'kat' } }),
    ],
  });
  await expect(other.strict.query()).rejects.toMatchObject({
    code: 'TOO_MANY_REQUESTS',
  });
  expect(await other.write.mutate()).toBe(1);
  expect(audited.entries).toEqual(['kat:write']);
});

test('extensions are checked against the root', () => {
  const needsTenant = initTrpc<{ ctx: { tenant: string } }>().procedure;
  // @ts-expect-error the root has no `tenant` in its ctx
  initTrpc<{ ctx: { ip: string } }>().concat(needsTenant);

  const numeric = initTrpc<{ meta: { rateLimit?: number } }>().procedure;
  // @ts-expect-error `rateLimit` meta has another type here
  t.concat(numeric);
});

test('implement() on an extended root runs the extension', async () => {
  const c = contract.create();
  const appContract = { ping: c.input(z.string()).query() };
  const impl = initTrpc<{ ctx: { ip: string } }>()
    .concat(rateLimit({ max: 1 }))
    .implement(appContract);
  const router = impl.router({
    ping: impl.ping.query(({ input, ctx }) => `${input}:${ctx.requestCount}`),
  });
  const caller = createRouterClient(router, { ctx: { ip: 'x' } });
  expect(await caller.ping.query('a')).toBe('a:1');
  await expect(caller.ping.query('b')).rejects.toMatchObject({
    code: 'TOO_MANY_REQUESTS',
  });
});
