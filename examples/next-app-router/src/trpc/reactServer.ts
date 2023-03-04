import { createTRPCNextAppRouter } from '@trpc/next-app-router/react-server';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { appRouter } from '~/server/router';

export const api = await createTRPCNextAppRouter({
  router: appRouter,
  // cached context per request
  createContext: cache(async () => {
    console.log('createContext');
    return {};
  }),
});
