// v11's closest match to v12's httpLink feature set: batching, streamed
// outputs and SSE, each its own link.
import {
  createTRPCClient,
  httpBatchStreamLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';

export const client = createTRPCClient<any>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: '/trpc' }),
      false: httpBatchStreamLink({ url: '/trpc' }),
    }),
  ],
});
