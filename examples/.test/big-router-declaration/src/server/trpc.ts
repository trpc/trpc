import { TRPCError, initTRPC } from '@trpc/server';
import type { Context } from '~/server/context';

const t = initTRPC.context<Context>().create();

export const router = t.router;

export const publicProcedure = t.procedure;
export const authedProcedure = t.procedure.use((opts) => {
    if (!opts.ctx.session) {
        throw new TRPCError({
            code: "UNAUTHORIZED"
        });
    }
    return opts.next({
        ctx: {
            session: opts.ctx.session
        }
    })
});
