/** Loaded on the first `admin.*` call (`lazy()` in `router.ts`). */
import { Effect } from 'effect';
import { z } from 'zod';
import { Store } from '../store.ts';
import { roles } from '../tenancy.ts';
import { adminProcedure, metrics, t } from '../trpc.ts';

export default t.router({
  members: adminProcedure.query((opts) =>
    Effect.gen(function* () {
      return (yield* Store).membersOf(opts.ctx.tenantId);
    }),
  ),
  setRole: adminProcedure
    .input(z.object({ userId: z.string(), role: z.enum(roles) }))
    .mutation((opts) =>
      Effect.gen(function* () {
        const member = (yield* Store).setRole(
          opts.ctx.tenantId,
          opts.input.userId,
          opts.input.role,
        );
        return member?.role ?? null;
      }),
    ),
  auditLog: adminProcedure.query((opts) =>
    Effect.gen(function* () {
      return (yield* Store).audit
        .filter((entry) => entry.tenantId === opts.ctx.tenantId)
        .map((entry) => ({ path: entry.path, ok: entry.ok }));
    }),
  ),
  metrics: adminProcedure.query(() => Object.fromEntries(metrics)),
});
