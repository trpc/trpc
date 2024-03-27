import { initTRPC } from '@trpc/server';
import { experimental_nextAppDirCaller } from '@trpc/server/adapters/next-app-dir';

const t = initTRPC.create();

export const nextProc = t.procedure
  .use(async function artificialDelay(opts) {
    if (t._config.isDev) {
      // random number between 100 and 500ms
      const waitMs = Math.floor(Math.random() * 400) + 100;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    return opts.next();
  })
  .experimental_caller(
    experimental_nextAppDirCaller({
      normalizeFormData: true,
    }),
  );

export {
  experimental_notFound as notFound,
  experimental_redirect as redirect,
} from '@trpc/server/adapters/next-app-dir';
