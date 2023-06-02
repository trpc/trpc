import { initTRPC } from '@trpc/server';
import * as z from 'zod';

const t = initTRPC.create();

export const publicProcedure = t.procedure;
export const createTRPCRouter = t.router;

export const appRouter = createTRPCRouter({
  wait: publicProcedure
    .input(z.object({ ms: z.number().positive() }))
    .query(async (opts) => {
      await new Promise((res) => setTimeout(res, opts.input.ms));

      return `waited ${opts.input.ms}ms`;
    }),
});

export type AppRouter = typeof appRouter;
