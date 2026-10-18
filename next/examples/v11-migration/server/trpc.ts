import { error, initTrpc } from '@trpc12/trpc/server';
import type { Context } from './context.ts';

export const t = initTrpc<{ ctx: Context }>();

export const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Send an authorization header' }),
);
