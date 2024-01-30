import type { TRPCRouterRecord } from '@trpc/server';
import { z } from 'zod';
import { publicProcedure } from '~/server/trpc';

export const __ROUTER__NAME__ = {
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
  childRouter: {
    hello: publicProcedure.query(() => 'there'),
    doSomething: publicProcedure.mutation(() => 'okay'),
  },
} satisfies TRPCRouterRecord
