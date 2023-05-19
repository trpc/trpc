import { experimental_createServerActionHandler } from '@trpc/next/app-dir/server';
import { initTRPC } from '@trpc/server';
import { headers } from 'next/headers';
import superjson from 'superjson';
import { Context } from './context';

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const createAction = experimental_createServerActionHandler(t, {
  createContext() {
    return {
      headers: Object.fromEntries(headers()),
    };
  },
});
