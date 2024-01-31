
import { z } from 'zod';
import { authedProcedure, publicProcedure, router } from '~/server/trpc';

export const router27 = router({
  greeting: publicProcedure
    .input(
      z.object({
        who: z.string()
      })
    )
    .query(({input}) => `hello ${input.who}`),
  greeting2: authedProcedure
    .input(
      z.object({
        who: z.string()
      })
    )
    .query(({input}) => `hello ${input.who}`),
    greeting3: publicProcedure
      .input(
        z.object({
          who: z.string()
        })
      )
      .query(({input}) => `hello ${input.who}`),
    greeting4: authedProcedure
      .input(
        z.object({
          who: z.string()
        })
      )
      .query(({input}) => `hello ${input.who}`),
    greeting5: publicProcedure
      .input(
        z.object({
          who: z.string()
        })
      )
      .query(({input}) => `hello ${input.who}`),
    childRouter: router({
      hello: publicProcedure.query(() => 'there'),
      doSomething: publicProcedure.mutation(() => 'okay'),
    })
});
