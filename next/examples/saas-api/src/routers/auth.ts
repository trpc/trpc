import { Effect } from 'effect';
import { error } from '@trpc12/trpc/server';
import { z } from 'zod';
import { Principal } from '../tenancy.ts';
import { Store } from '../store.ts';
import { publicProcedure, t, tenantProcedure } from '../trpc.ts';

export const authRouter = t.router({
  health: publicProcedure.query(() => 'ok' as const),
  auth: {
    /** Sets a session cookie; the token also works as a bearer token. */
    login: publicProcedure
      .input(z.object({ email: z.email() }))
      .mutation((opts) =>
        Effect.gen(function* () {
          const session = (yield* Store).login(opts.input.email);
          if (!session) return yield* error({ code: 'UNAUTHORIZED' });
          opts.response.headers.append(
            'set-cookie',
            `sid=${session.token}; HttpOnly; Path=/; SameSite=Lax`,
          );
          opts.response.status = 201;
          return session;
        }),
      ),
    me: tenantProcedure.query(() =>
      Effect.gen(function* () {
        const principal = yield* Principal;
        return { name: principal.user.name, role: principal.role };
      }),
    ),
  },
});
