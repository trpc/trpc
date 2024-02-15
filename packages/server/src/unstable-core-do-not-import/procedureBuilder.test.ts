import { z } from 'zod';
import { TRPCError } from './error/TRPCError';
import { initTRPC } from './initTRPC';
import type { inferProcedureBuilderResolverOptions } from './procedureBuilder';

type Constructor<T extends object = object> = new (...args: any[]) => T;

// TODO: move to a test-utils package
async function waitError<TError extends Error = Error>(
  /**
   * Function callback or promise that you expect will throw
   */
  fnOrPromise: Promise<unknown> | (() => unknown),
  /**
   * Force error constructor to be of specific type
   * @default Error
   **/
  errorConstructor?: Constructor<TError>,
): Promise<TError> {
  try {
    if (typeof fnOrPromise === 'function') {
      await fnOrPromise();
    } else {
      await fnOrPromise;
    }
  } catch (cause) {
    expect(cause).toBeInstanceOf(Error);
    if (errorConstructor) {
      expect((cause as Error).name).toBe(errorConstructor.name);
    }
    return cause as TError;
  }
  throw new Error('Function did not throw');
}

test('inferProcedureBuilderResolverOptions', async () => {
  type Organization = {
    id: string;
    name: string;
  };
  type Membership = {
    role: 'ADMIN' | 'MEMBER';
    Organization: Organization;
  };
  type User = {
    id: string;
    memberships: Membership[];
  };
  type Context = {
    /**
     * User is nullable
     */
    user: User | null;
  };

  const t = initTRPC.context<Context>().create();

  const publicProcedure = t.procedure;
  /**
   * Authed procedure
   */
  const authedProcedure = publicProcedure.use((opts) => {
    if (!opts.ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
      });
    }
    return opts.next({
      ctx: {
        user: opts.ctx.user,
      },
    });
  });
  // -------------------- Authed procedure --------------------
  const authedProcedureHelperFn = (
    opts: inferProcedureBuilderResolverOptions<typeof authedProcedure>,
  ) => {
    // input is unknown because it's not defined
    expectTypeOf(opts.input).toEqualTypeOf<unknown>();
    // user is non-nullable
    expectTypeOf(opts.ctx.user).toEqualTypeOf<User>();
  };

  const postRouter = t.router({
    getPost: publicProcedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .query(() => {
        return {};
      }),
    listPosts: publicProcedure
      .input(
        z.object({
          limit: z.number(),
        }),
      )
      .query(() => {
        return [];
      }),

    addPost: authedProcedure.mutation((opts) => {
      authedProcedureHelperFn(opts);
      return {};
    }),
    deletePost: authedProcedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .mutation((opts) => {
        authedProcedureHelperFn(opts);
        return {};
      }),
  });

  const viewerRouter = t.router({
    whoami: authedProcedure.query((opts) => {
      authedProcedureHelperFn(opts);
      return opts.ctx.user;
    }),
  });

  // -------------------- Authed procedure with an organization --------------------
  /**
   * Authed procedure with an organization
   */
  const organizationProcedure = authedProcedure
    .input(z.object({ organizationId: z.string() }))
    .use(function isMemberOfOrganization(opts) {
      const org = opts.ctx.user.memberships.find(
        (m) => m.Organization.id === opts.input.organizationId,
      );
      if (!org) {
        throw new TRPCError({
          code: 'FORBIDDEN',
        });
      }
      return opts.next({
        ctx: {
          Organization: org.Organization,
        },
      });
    });

  const organizationProcedureHelperFn = (
    opts: inferProcedureBuilderResolverOptions<typeof organizationProcedure>,
  ) => {
    expectTypeOf(opts.input).toEqualTypeOf<{
      organizationId: string;
      [k: string]: unknown;
    }>();
    opts.input.organizationId;

    expectTypeOf(opts.input['meep']).toEqualTypeOf<unknown>();
    // user is non-nullable
    expectTypeOf(opts.ctx.user).toEqualTypeOf<User>();
    // Organization is non-nullable
    expectTypeOf(opts.ctx.Organization).toEqualTypeOf<Organization>();
  };

  const orgRouter = t.router({
    getOrg: organizationProcedure.query((opts) => {
      // works with authed helper fn
      authedProcedureHelperFn(opts);
      // works with org helper fn
      organizationProcedureHelperFn(opts);
      return opts.ctx.Organization;
    }),
  });

  const appRouter = t.mergeRouters(orgRouter, postRouter, viewerRouter);

  const createCaller = t.createCallerFactory(appRouter);

  {
    // public caller
    const caller = createCaller({
      user: null,
    });

    const err = await waitError(
      caller.getOrg({
        organizationId: '1',
      }),
      TRPCError,
    );

    expect(err.code).toBe('UNAUTHORIZED');
  }
  {
    // authed caller
    const caller = createCaller({
      user: {
        id: '1',
        memberships: [
          {
            role: 'ADMIN',
            Organization: {
              id: '1',
              name: 'My org',
            },
          },
        ],
      },
    });

    const result = await caller.getOrg({
      organizationId: '1',
    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "id": "1",
        "name": "My org",
      }
    `);

    // access org they don't have access to
    const err = await waitError(
      caller.getOrg({
        organizationId: '2',
      }),
      TRPCError,
    );
    expect(err.code).toBe('FORBIDDEN');
  }
});
