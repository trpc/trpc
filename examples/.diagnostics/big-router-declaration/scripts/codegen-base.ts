import { publicProcedure, router } from '~/server/trpc';
import { z } from 'zod';

export const __ROUTER__NAME__ = router({
  greeting: publicProcedure
    .input(
      z.object({
        who: z.string(),
      }),
    )
    .query(({ input }) => `hello ${input.who}`),
  greeting2: publicProcedure
    .input(
      z.object({
        who: z.string(),
      }),
    )
    .query(({ input }) => `hello ${input.who}`),
  greeting3: publicProcedure
    .input(
      z.object({
        who: z.string(),
      }),
    )
    .query(({ input }) => `hello ${input.who}`),
  greeting4: publicProcedure
    .input(
      z.object({
        who: z.string(),
      }),
    )
    .query(({ input }) => `hello ${input.who}`),
  greeting5: publicProcedure
    .input(
      z.object({
        who: z.string(),
      }),
    )
    .query(({ input }) => `hello ${input.who}`),
  childRouter: router({
    hello: publicProcedure.query(() => 'there'),
    doSomething: publicProcedure.mutation(() => 'okay'),
  }),
});
