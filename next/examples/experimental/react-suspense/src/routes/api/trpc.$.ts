import { createFileRoute } from '@tanstack/react-router';
import { experimental_createProgressiveJson } from '@trpc12/trpc/transformer';
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter } from '../../server/router.ts';

// Progressive JSON on both ends, so `createdAt` arrives as a `Date`.
const handler = createFetchHandler({
  router: appRouter,
  endpoint: '/api/trpc',
  transformer: experimental_createProgressiveJson(),
});

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: (opts) => handler.fetch(opts.request),
      POST: (opts) => handler.fetch(opts.request),
    },
  },
});
