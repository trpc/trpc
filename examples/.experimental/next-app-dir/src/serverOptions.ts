// import { headers } from 'next/headers';
import { appRouter } from './server/routers/_app';

export const serverOptions = {
  router: appRouter,
  createContext: async () => {
    // const ctxHeaders = headers();
  },
};
