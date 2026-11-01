import { authed, t } from '@acme/trpc';
import { error } from '@trpc12/trpc/server';
import { z } from 'zod';

export interface User {
  id: string;
  name: string;
}

const users = new Map<string, User>([
  ['ada', { id: 'ada', name: 'Ada Lovelace' }],
]);

export const usersRouter = t.router({
  byId: t.procedure
    .input(z.object({ id: z.string() }))
    .query(
      (opts) =>
        users.get(opts.input.id) ??
        error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
    ),
  me: authed.query(
    (opts) =>
      users.get(opts.ctx.user) ??
      error({ code: 'NOT_FOUND', data: { id: opts.ctx.user } }),
  ),
});

export type UsersRouter = typeof usersRouter;
