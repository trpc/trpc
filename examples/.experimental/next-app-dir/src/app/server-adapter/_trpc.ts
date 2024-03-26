import { initTRPC } from '@trpc/server';
import { experimental_nextAppDirCaller } from '@trpc/server/adapters/next-app-dir';

const t = initTRPC.create();

export const nextProc = t.procedure.experimental_caller(
  experimental_nextAppDirCaller({
    normalizeFormData: true,
  }),
);
