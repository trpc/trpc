/**
 * What every domain package builds on: `t` and its base procedures. Kept
 * apart from the domains so they don't depend on each other.
 */
import { error, initTrpc } from '@trpc12/trpc/server';

export interface Context {
  user: string | null;
}

export const t = initTrpc<{ ctx: Context }>();

export const isAuthed = t.middleware((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Send an authorization header' }),
);

export const authed = t.procedure.use(isAuthed);
