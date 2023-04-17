import { createProcedureChainer } from '@trpc/server/core/middleware';
import { TRPCError, initTRPC } from '@trpc/server/src';
import { z } from 'zod';

test('middleware', () => {
  const t = initTRPC.context<{ userId: string }>().create();

  // Why is this cool?
  // Well external vendors can write entire extensions to base procedures 
  // without needing to know the content of `t`
  // ALSO
  // it enables complex middlewares which leverage the existing awesomeness of ProcedureBuilder to merge on their own inputs and middlewares
  const experimentalChainer = createProcedureChainer((proc) => {
    return proc.input(z.object({ orgId: z.number() })).use(({ next }) => {
      return next({
        ctx: {
          orgPermitted: true,
        },
      });
    });
  });

  t.procedure
    .use(experimentalChainer)
    .input(z.object({ name: z.string() }))
    .query((opts) => {
      const orgId = opts.input.orgId;
      //      ^?
      const name = opts.input.name;
      //      ^?
      const orgOk = opts.ctx.orgPermitted;
      //      ^?
      const userId = opts.ctx.userId;
      //      ^?

      if (!orgOk) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `User ${userId} does not have access to ${orgId}`,
        });
      }

      return `Hello, ${name} from org ${orgId}`;
    });
});
