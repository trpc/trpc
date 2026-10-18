/**
 * The app's roots and base procedures. `pub` is the bare root; `t` adds the
 * tenancy and audit extensions to every procedure built from it.
 */
import { Effect } from 'effect';
import { onError, onFinish } from '@trpc12/trpc/middleware';
import { initTrpc, ok } from '@trpc12/trpc/server';
import { audit } from './audit.ts';
import { ResponseCache, Store } from './store.ts';
import { tenancy } from './tenancy.ts';

/** What `createContext` reads from each request. */
export interface RequestContext {
  sessionToken: string | null;
  tenantSlug: string | null;
}

export interface AppMeta {
  /** Serve the query from `cachedQuery`'s cache until the tenant's data changes. */
  cache?: boolean;
}

const pub = initTrpc<{ ctx: RequestContext; meta: AppMeta }>();
export const t = pub.concat(tenancy()).concat(audit());

/** Calls and failures per path, since the process started. */
export const metrics = new Map<string, { ok: number; failed: number }>();

const countCalls = onFinish((result, opts) => {
  const counts = metrics.get(opts.path) ?? { ok: 0, failed: 0 };
  if (result.ok) counts.ok += 1;
  else counts.failed += 1;
  metrics.set(opts.path, counts);
});

const logCrashes = onError((error, opts) => {
  if (error.code === 'INTERNAL_SERVER_ERROR') {
    console.error(`[saas-api] ${opts.path} crashed`, error.cause);
  }
});

export const publicProcedure = pub.procedure.use(countCalls).use(logCrashes);
export const tenantProcedure = t.procedure.use(countCalls).use(logCrashes);
export const memberProcedure = tenantProcedure.meta({ role: 'member' });
export const adminProcedure = tenantProcedure.meta({ role: 'admin' });

/**
 * Short-circuits with `ok()` when the tenant's data hasn't changed since the
 * result was cached. `T` is the procedure's output, which `ok()` must match.
 */
export const cachedQuery = <T>() =>
  t.middleware.effect()((opts) =>
    Effect.gen(function* () {
      if (!opts.meta.cache) return yield* opts.next();
      const cache = yield* ResponseCache;
      const version = (yield* Store).version(opts.ctx.tenantId);
      const key = `${opts.ctx.tenantId}@${version}:${opts.path}:${JSON.stringify(opts.input)}`;
      if (cache.has(key)) {
        opts.response.headers.set('x-cache', 'hit');
        return ok(cache.get(key) as T);
      }
      const result = yield* opts.next();
      if (result.ok) cache.set(key, result.data);
      opts.response.headers.set('x-cache', 'miss');
      return result;
    }),
  );
