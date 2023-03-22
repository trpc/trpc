import { initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { createInnerTRPCContext } from './context';

const t = initTRPC.context<typeof createInnerTRPCContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const baseProcedure = t.procedure;
