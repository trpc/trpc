import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter } from '../../../../server/router.ts';
import { transformer } from '../../../../trpc/transformer.ts';

const handler = createFetchHandler({
  router: appRouter,
  endpoint: '/api/trpc',
  batch: { maxItems: 100 },
  transformer,
});

export const GET = (request: Request): Promise<Response> =>
  handler.fetch(request);
export const POST = GET;
