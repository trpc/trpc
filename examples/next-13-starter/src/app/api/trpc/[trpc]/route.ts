import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { NextRequest } from 'next/server';
import { appRouter } from '~/server/api/router';
import { createTRPCContext } from '~/server/api/trpc';

// Not sure why this is needed - but `crypto`
// is not available on routes not deployed on edge
// without this polyfill. Prob to do with the
// custom NextAuth setup to get auth working on edge
globalThis.crypto = require('crypto');

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext as any,
  });

export { handler as GET, handler as POST };
