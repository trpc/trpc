/**
 * Reference code for https://github.com/trpc/trpc/discussions/2221#discussioncomment-10770539
 */
import type { TRPCRouterRecord } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

interface User {
  id: string;
  name: string;
}
interface Session {
  user?: User;
}
const t = initTRPC
  .context<{
    session: Session | null;
  }>()
  .create();

/**
 * Protected base procedure
 */
const authedProcedure = t.procedure.use(function isAuthed(opts) {
  const { session } = opts.ctx;

  if (!session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return opts.next({
    ctx: {
      user: session.user,
    },
  });
});
test('first example', async () => {
  function createRouterFromBuilder<TBuilder>(builder: TBuilder) {
    return function createRouter<TRouterRecord extends TRPCRouterRecord>(
      callback: (base: TBuilder) => TRouterRecord,
    ) {
      const result = callback(builder);
      return t.router(result);
    };
  }

  // usage
  const authedRouter = createRouterFromBuilder(authedProcedure);

  const userSettings = authedRouter((base) => ({
    whoami: base.query((opts) => opts.ctx.user),
    edit: base
      .input(
        z.object({
          name: z.string(),
        }),
      )
      .mutation(async (opts) => {
        // [...db operations]

        return {
          ...opts.ctx.user,
          ...opts.input,
        };
      }),
  }));

  const caller = userSettings.createCaller({
    session: {
      user: {
        id: '1',
        name: 'ahkhanjani',
      },
    },
  });

  expect(await caller.whoami()).toEqual({
    id: '1',
    name: 'ahkhanjani',
  });
});

test('second example', async () => {
  // This is all the code you need to define wherever you define your `initTRPC()`
  function createRouterFromBuilder<TBuilder>(builder: TBuilder) {
    return function createRouter<TRouterRecord extends TRPCRouterRecord>(
      callback: (base: TBuilder) => TRouterRecord,
    ) {
      const result = callback(builder);
      return t.router(result);
    };
  }

  // usage
  const authedRouter = createRouterFromBuilder(authedProcedure);

  const userSettings = authedRouter((base) => ({
    whoami: base.query((opts) => opts.ctx.user),
    edit: base
      .input(
        z.object({
          name: z.string(),
        }),
      )
      .mutation(async (opts) => {
        // [...db operations]

        return {
          ...opts.ctx.user,
          ...opts.input,
        };
      }),
  }));

  const caller = userSettings.createCaller({
    session: {
      user: {
        id: '1',
        name: 'ahkhanjani',
      },
    },
  });

  expect(await caller.whoami()).toEqual({
    id: '1',
    name: 'ahkhanjani',
  });
});
