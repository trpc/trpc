import { createFileRoute } from '@tanstack/react-router';
import { createSerializer } from '@trpc12/trpc/serializer';
import { createFetchHandler } from '@trpc12/trpc/server';
import { appRouter } from '../../server/router.ts';

// danSON on both ends, so `createdAt` arrives as a `Date`.
const handler = createFetchHandler({
  router: appRouter,
  endpoint: '/api/trpc',
  serializer: createSerializer(),
});

export const Route = createFileRoute('/api/trpc/$')({
  server: {
    handlers: {
      GET: (opts) => handler.fetch(opts.request),
      POST: (opts) => handler.fetch(opts.request),
    },
  },
});
