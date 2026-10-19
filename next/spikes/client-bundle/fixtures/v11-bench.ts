// `pnpm bench bundle`'s v11 client: SSE and single calls, superjson.
import {
  createTRPCClient,
  httpLink,
  httpSubscriptionLink,
  splitLink,
} from '@trpc/client';
import SuperJSON from 'superjson';

export const client = createTRPCClient<any>({
  links: [
    splitLink({
      condition: (op) => op.type === 'subscription',
      true: httpSubscriptionLink({ url: '/trpc', transformer: SuperJSON }),
      false: httpLink({ url: '/trpc', transformer: SuperJSON }),
    }),
  ],
});
