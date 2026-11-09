// v11's smallest client: `httpLink`, no transformer, no subscriptions.
import { createTRPCClient, httpLink } from '@trpc/client';

export const client = createTRPCClient<any>({
  links: [httpLink({ url: '/trpc' })],
});
