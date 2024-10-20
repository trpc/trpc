/**
 * Reference code for https://github.com/trpc/trpc/discussions/2221#discussioncomment-10770539
 */
import type { AnyProcedure, AnyRouter, TRPCRouterRecord } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

interface User {
  id: string;
  name: string;
}
interface Session {
  user?: User;
}
type ProcedureKind = 'authed' | 'public';
interface ProcedureMeta {
  kind: ProcedureKind;
}
const t = initTRPC
  .context<{
    session: Session | null;
  }>()
  .meta<ProcedureMeta>()
  .create();

const publicProcedure = t.procedure.meta({ kind: 'public' });
/**
 * Protected base procedure
 */
const authedProcedure = publicProcedure
  .use(function isAuthed(opts) {
    const { session } = opts.ctx;

    if (!session?.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return opts.next({
      ctx: {
        user: session.user,
      },
    });
  })
  .meta({
    kind: 'authed',
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

test('suggestion - validate routers', () => {
  function validateRouter(appRouter: AnyRouter) {
    const procedures = Object.entries(appRouter._def.procedures);
    type ErrorObject = {
      expected: ProcedureKind[];
      actual: unknown;
      path: string;
    };

    const errors: ErrorObject[] = [];
    for (const [path, procedure] of procedures) {
      const meta = (procedure as AnyProcedure)._def.meta as
        | ProcedureMeta
        | undefined;
      const expectedKinds = ((): ProcedureKind[] => {
        // If the path includes "public", we expect it to be a public procedure
        if (path.includes('public.')) {
          return ['public'];
        }

        // [.... insert other kinds here]

        // Everything else, we expect to be an authed procedure
        return ['authed'];
      })();

      if (!meta?.kind || !expectedKinds.includes(meta?.kind)) {
        errors.push({
          path,
          expected: expectedKinds,
          actual: meta?.kind,
        });
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Invalid router setup. Errors: ${JSON.stringify(errors, null, 4)}`,
      );
    }
  }

  {
    // happy path
    const appRouter = t.router({
      whoami: authedProcedure.query((it) => it.ctx.user),
      post: {
        add: authedProcedure.mutation(() => {
          // ...
        }),
      },
      user: {
        public: {
          whoami: publicProcedure.query((it) => it.ctx.session?.user ?? null),
        },
        edit: authedProcedure.mutation(() => {
          // ...
        }),
      },
    });
    validateRouter(appRouter);
  }
  {
    // bad router setup example

    const appRouter = t.router({
      whoami: authedProcedure.query((it) => it.ctx.user),
      post: {
        add: publicProcedure.mutation(() => {
          // ...
        }),
      },
      user: {
        public: {
          whoami: publicProcedure.query((it) => it.ctx.session?.user ?? null),
        },
        edit: publicProcedure.mutation(() => {
          // ...
        }),
      },
    });

    expect(() => validateRouter(appRouter)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Invalid router setup. Errors: [
          {
              "path": "post.add",
              "expected": [
                  "authed"
              ],
              "actual": "public"
          },
          {
              "path": "user.edit",
              "expected": [
                  "authed"
              ],
              "actual": "public"
          }
      ]]
    `);
  }
});
