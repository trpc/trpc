import type { AppRouter } from '../../../server';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import {
  clientRoot,
  createClient,
  createTRPCTransport,
} from 'react-fate';

type TRPCClientType = ReturnType<typeof createTRPCProxyClient<AppRouter>>;

const roots = {
  greeting: clientRoot('Greeting'),
  viewer: clientRoot('Greeting'),
} as const;

type GeneratedClientRoots = typeof roots;

declare module 'react-fate' {
  interface ClientRoots extends GeneratedClientRoots {}
}

const trpcClient = createTRPCProxyClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:2022' })],
});

export const createFateClient = () =>
  createClient<[GeneratedClientRoots, Record<never, never>]>({
  roots,
  transport: createTRPCTransport<AppRouter>({
    byId: {
      Greeting: (client: TRPCClientType) => ({ args, ids, select }) =>
        client.greetingById.query({
          args,
          ids: ids.map(String),
          select,
        }),
    },
    client: trpcClient,
    queries: {
      viewer: (client: TRPCClientType) => client.viewer.query,
    },
  }),
  types: [
    {
      type: 'Greeting',
    },
  ],
});
