import { experimental_standaloneMiddleware, initTRPC } from '@trpc/server';
import * as z from 'zod';

describe('input/context proper narrowing in procedure chain', () => {
  test("a narrower input type earlier in the chain should not widen because of a later middleware's wider input requirements", () => {
    const t = initTRPC.create();

    const organizationAuth = experimental_standaloneMiddleware<{
      input: { organizationId?: string };
    }>().create(async ({ next, ctx }) => {
      return await next({ ctx });
    });

    t.router({
      createProject: t.procedure
        // input enforces that organizationId is required
        .input(z.object({ organizationId: z.string().uuid() }))
        // middleware allows organizationId to be optional
        .use(organizationAuth)
        .mutation(({ input }) => {
          // input is still required
          expectTypeOf(input).toEqualTypeOf<{ organizationId: string }>();
        }),
      updateProject: t.procedure
        // input allows organizationId to be optional
        .input(z.object({ organizationId: z.string().uuid().optional() }))
        // middleware allows organizationId to be optional
        .use(organizationAuth)
        .mutation(({ input }) => {
          // input remains optional
          expectTypeOf(input).toEqualTypeOf<{ organizationId?: string }>();
        }),
    });
  });

  test("a narrower ctx type earlier in the chain should not widen because of a later middleware's wider ctx requirements", () => {
    const t = initTRPC.context<{ organizationId: string }>().create();

    const organizationCtx = experimental_standaloneMiddleware<{
      ctx: { organizationId?: string };
    }>().create(async ({ next }) => {
      return next();
    });

    t.router({
      createProject: t.procedure.use(organizationCtx).mutation(({ ctx }) => {
        expectTypeOf(ctx).toEqualTypeOf<{ organizationId: string }>();
      }),
    });
  });
});
