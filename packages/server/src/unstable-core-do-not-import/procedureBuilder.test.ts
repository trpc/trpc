import { z } from 'zod';
import { TRPCError } from './error/TRPCError';
import { initTRPC } from './initTRPC';
import type { inferProcedureBuilderResolverOptions } from './procedureBuilder';

test('inferProcedureBuilderResolverOptions', () => {
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
    getPost: authedProcedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .query((opts) => {
        authedProcedureHelperFn(opts);
        return 'hi';
      }),
    listPosts: authedProcedure
      .input(
        z.object({
          limit: z.number(),
        }),
      )
      .query((opts) => {
        authedProcedureHelperFn(opts);
        return 'hi';
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
    // @ts-expect-error this doesn't exist
    opts.input.meep;
    // user is non-nullable
    expectTypeOf(opts.ctx.user).toEqualTypeOf<User>();
    // Organization is non-nullable
    expectTypeOf(opts.ctx.Organization).toEqualTypeOf<Organization>();
  };

  const orgRouter = t.router({
    getOrg: organizationProcedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .query((opts) => {
        // works with authed helper fn
        authedProcedureHelperFn(opts);
        // works with org helper fn
        organizationProcedureHelperFn(opts);
        return 'hi';
      }),
  });

  t.router({
    post: postRouter,
    org: orgRouter,
  });
});
