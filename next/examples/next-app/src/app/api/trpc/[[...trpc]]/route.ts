import { createFetchHandler } from 'trpcdev/server';
import { appRouter } from '../../../../server/router.ts';
import { serializer } from '../../../../trpc/serializer.ts';

const handler = createFetchHandler({
  router: appRouter,
  endpoint: '/api/trpc',
  batch: true,
  serializer,
});

export const GET = (request: Request): Promise<Response> =>
  handler.fetch(request);
export const POST = GET;
