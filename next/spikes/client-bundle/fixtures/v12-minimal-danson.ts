// The Promise httpLink with danSON: Dates, Maps and files survive, no streams.
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { createSerializer } from '@trpc12/trpc/serializer';

export const client = createTrpcClient({
  router: routerType<any>(),
  links: [httpLink({ url: '/trpc', serializer: createSerializer() })],
});
