import type { AppRouter, Feed, Post } from '~/server/routers/_app';
import { createTRPCProxyClient } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import {
  clientRoot,
  createClient,
  createTRPCTransport,
  mutation,
} from 'react-fate';
import { transformer } from './transformer';

type TRPCClientType = ReturnType<typeof createTRPCProxyClient<AppRouter>>;
type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

const mutations = {
  'post.add': mutation<
    Post,
    RouterInputs['post']['add'],
    RouterOutputs['post']['add']
  >('Post'),
} as const;

const roots = {
  feed: clientRoot<RouterOutputs['feed']['get'], 'Feed'>('Feed'),
  post: clientRoot<RouterOutputs['post']['byId'], 'Post'>('Post'),
  posts: clientRoot<RouterOutputs['post']['list'], 'Post'>('Post'),
} as const;

type GeneratedClientMutations = typeof mutations;
type GeneratedClientRoots = typeof roots;

declare module 'react-fate' {
  interface ClientMutations extends GeneratedClientMutations {}
  interface ClientRoots extends GeneratedClientRoots {}
}

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return '';
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.RENDER_INTERNAL_HOSTNAME) {
    return `http://${process.env.RENDER_INTERNAL_HOSTNAME}:${process.env.PORT}`;
  }
  return `http://127.0.0.1:${process.env.PORT ?? 3000}`;
}

export const createFateClient = (options: {
  links: Parameters<typeof createTRPCProxyClient>[0]['links'];
}) => {
  const trpcClient = createTRPCProxyClient<AppRouter>({
    links: options.links,
  });

  const trpcMutations = {
    'post.add': (client: TRPCClientType) => client.post.add.mutate,
  } as const;

  return createClient<[GeneratedClientRoots, GeneratedClientMutations]>({
    mutations,
    roots,
    transport: createTRPCTransport<AppRouter, typeof trpcMutations>({
      byId: {
        Feed:
          (client: TRPCClientType) =>
          ({ args, ids, select }) =>
            client.feed.byId.query({
              args,
              ids: ids.map(String),
              select,
            }),
        Post:
          (client: TRPCClientType) =>
          ({ args, ids, select }) =>
            client.post.byId.query({
              args,
              ids: ids.map(String),
              select,
            }),
      },
      client: trpcClient,
      lists: {
        posts: (client: TRPCClientType) => client.post.list.query,
      },
      mutations: trpcMutations,
      queries: {
        feed: (client: TRPCClientType) => client.feed.get.query,
      },
    }),
    types: [
      {
        fields: {
          posts: { listOf: 'Post' },
        },
        type: 'Feed',
      },
      {
        type: 'Post',
      },
    ],
  });
};

export { getBaseUrl };
