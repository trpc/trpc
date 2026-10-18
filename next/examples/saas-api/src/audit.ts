/**
 * An audit extension from another package. It starts with tenancy's
 * `withSession`, so concatenated after `tenancy()` the session is looked up
 * once, and it needs the `tenantId` tenancy adds, which `t.concat()` checks.
 * The app's layer implements `AuditLog`.
 */
import { Context, Effect } from 'effect';
import { initTrpc, middleware } from '@trpc12/trpc/server';
import { withSession, type User } from './tenancy.ts';

export interface AuditEntry {
  readonly tenantId: string;
  readonly userId: string;
  readonly path: string;
  readonly ok: boolean;
}

export class AuditLog extends Context.Service<
  AuditLog,
  { readonly record: (entry: AuditEntry) => Effect.Effect<void> }
>()('audit/AuditLog') {}

const recordWrites = middleware.effect<{
  ctx: { user: User; tenantId: string };
}>()((opts) =>
  Effect.gen(function* () {
    const result = yield* opts.next();
    if (opts.type === 'mutation') {
      yield* (yield* AuditLog).record({
        tenantId: opts.ctx.tenantId,
        userId: opts.ctx.user.id,
        path: opts.path,
        ok: result.ok,
      });
    }
    return result;
  }),
);

const a = initTrpc<{ ctx: { sessionToken: string | null } }>();

export const audit = () => a.procedure.use(withSession).use(recordWrites);
