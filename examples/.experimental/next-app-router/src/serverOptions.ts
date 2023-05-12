// import { headers } from 'next/headers';
import { appRouter } from './server/router';

export const serverOptions = {
  router: appRouter,
  createContext: async () => {
    // const ctxHeaders = headers();
  },
};
