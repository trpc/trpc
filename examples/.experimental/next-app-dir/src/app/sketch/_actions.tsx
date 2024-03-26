import * as z from 'zod';
import { TRPCError, initTRPC } from '@trpc/server';
import { redirect } from "next/navigation"
import { createStripeUrl  } from './_repo';

// this exists somewhere else
const t = initTRPC.create()

const auth = () => ({ userId: '123' });

const authedProc = t.procedure.use((opts) => {
    const { userId } = auth();
    if (!userId) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return opts.next({ ctx: { userId: userId } });
})

const appProc = authedProc.input(z.object({ appId: z.string() })).use((opts) => {
    const { appId } = opts.input;

    // @ts-expect-error what
    const userHasAccess = await userCanAccess({ userId: opts.ctx.userId, appId });
    if (!userHasAccess) throw new TRPCError({ code: 'FORBIDDEN' });

    return opts.next({ ctx: { appId } });
})

export const openBilling = appProc.mutation(async (opts) => {
    const url = await createStripeUrl(opts.input.appId);
    if (!url) {
        return trpcError({ error: "Failed to create billing session" };
    }
    redirect(url);
})
