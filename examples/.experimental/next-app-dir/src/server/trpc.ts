import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { createContext } from './context';

const t = initTRPC
  .context<inferAsyncReturnType<typeof createContext>>()
  .create();

export const router = t.router;
export const publicProcedure = t.procedure;
