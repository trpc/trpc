import { expectTypeOf } from 'expect-type';
import * as trpc from '@trpc/server';
import { z } from 'zod';

const appRouter = trpc.router().merge(
  'admin/',
  trpc
    .router()
    .mutation('testMutation', {
      input: z.object({
        foo: z.string(),
      }),
      resolve: async ({ input }) => `${input.foo}!`,
    })
    .middleware(async ({ next }) => next()),
);

type Mutations = typeof appRouter._def.mutations;

expectTypeOf<
  trpc.inferProcedureInput<Mutations['admin/testMutation']>
>().toEqualTypeOf<{ foo: string }>();

expectTypeOf<
  trpc.inferProcedureInput<Mutations['admin/testMutation']>
>().not.toBeUnknown();
