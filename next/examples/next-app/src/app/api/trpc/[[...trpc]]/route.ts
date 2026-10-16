import { createFetchHandler } from 'trpcdev/server';
import { appRouter } from '../../../../server/router.ts';

const handler = createFetchHandler({
  router: appRouter,
  endpoint: '/api/trpc',
  batch: true,
});

export const GET = (request: Request): Promise<Response> =>
  handler.fetch(request);
export const POST = GET;
