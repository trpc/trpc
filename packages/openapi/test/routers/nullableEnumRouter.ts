import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

type Status = 'active' | 'archived';

export const NullableEnumRouter = t.router({
  status: t.procedure.query((): Status | null => null),

  priority: t.procedure.query((): 1 | 2 | 3 | null => null),

  requiredStatus: t.procedure.query((): Status => 'active'),

  filter: t.procedure
    .input(z.object({ status: z.enum(['active', 'archived']).nullable() }))
    .query(({ input }) => input.status),
});

export type NullableEnumRouter = typeof NullableEnumRouter;
