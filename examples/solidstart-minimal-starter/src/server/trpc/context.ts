import type { inferAsyncReturnType } from '@trpc/server';
import { type CreateSolidContextOptions } from '@trpc/server/adapters/solid';

export const createContextInner = async (opts: CreateSolidContextOptions) => {
  return {
    ...opts,
  };
};

export const createContext = async (opts: CreateSolidContextOptions) => {
  return await createContextInner(opts);
};

export type IContext = inferAsyncReturnType<typeof createContext>;
