/**
 * What a standalone package (say `@acme/trpc-audit`) would publish. Its own
 * `t` declares what it needs: a `db` in ctx and an optional `audit` meta key.
 */
import { initTrpc, schema } from './core.ts';

export interface AuditDb {
  audit: { write(entry: { path: string; actor: string }): Promise<void> };
}

const t = initTrpc<{
  ctx: { db: AuditDb; user: { id: string } };
  meta: { audit?: boolean };
}>();

export const auditPlugin = t.procedure.use(async ({ ctx, meta, next }) => {
  if (meta.audit) await ctx.db.audit.write({ path: '', actor: ctx.user.id });
  return next({ ctx: { auditedBy: ctx.user.id } });
});

/** A plugin can bring inputs too: every procedure using it takes `requestId`. */
export const tracedPlugin = initTrpc()
  .procedure.input(schema<{ requestId: string }>())
  .use(async ({ input, next }) =>
    next({ ctx: { requestId: input.requestId } }),
  );
