import { initTRPC } from '@trpc/server';
import { experimental_nextAppDirCaller } from '@trpc/server/adapters/next-app-dir';

const t = initTRPC.create();

export const nextProc = t.procedure
  .use(async function artificialDelay(opts) {
    if (t._config.isDev) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return opts.next();
  })
  .experimental_caller(
    experimental_nextAppDirCaller({
      normalizeFormData: true,
    }),
  );