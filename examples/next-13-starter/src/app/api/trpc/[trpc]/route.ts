import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { NextRequest } from 'next/server';
import { appRouter } from '~/server/api/router';
import { createTRPCContext } from '~/server/api/trpc';

export const runtime = 'edge';

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext as any,
  });

export { handler as GET, handler as POST };
