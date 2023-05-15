import { experimental_createServerActionHandler } from '@trpc/next/app-dir/server';
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { createContext } from './context';

const t = initTRPC
  .context<inferAsyncReturnType<typeof createContext>>()
  .create({
    // transformer: superjson,
  });

export const router = t.router;
export const publicProcedure = t.procedure;

export const createAction = experimental_createServerActionHandler(t, {
  createContext() {
    return {
      async getSession() {
        // TODO
        return null;
      },
    };
  },
});
