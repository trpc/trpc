import { initTrpc, schema } from '../core.ts';

const t = initTrpc<{ user: { id: string } }>();

export const adminRouter = {
  stats: t.procedure.query(() => ({ users: 1 })),
  ban: t.procedure
    .input(schema<{ userId: string }>())
    .mutation(({ input }) => ({ banned: input.userId })),
};

export default adminRouter;
