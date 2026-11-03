---
id: ssg
title: Static Site Generation
sidebar_label: Static Site Generation (SSG)
description: Prefetch tRPC queries in getStaticProps with createTRPCOptionsProxy and dehydrate, and stop the client from refetching them
slug: /client/nextjs/pages-router/ssg
section: "Client Usage"
parent: "client/nextjs/pages-router/setup"
order: 72
---

To build a page's data into static HTML, prefetch its queries in `getStaticProps`. It works like [prefetching in `getServerSideProps`](./ssr.md), except that it runs at build time, or when Next.js revalidates the page, so there's no request.

This page builds on the [Pages Router setup](./setup.md).

## Fetch data in `getStaticProps`

Make a query client and a tRPC proxy that calls your router directly, prefetch the queries, and return the cache as `trpcState`. There's no request to build the context from, so pass one that doesn't need it.

This example uses superjson, so the post's `createdAt` reaches the page as a `Date`. It needs the matching `_app` from [Using a data transformer](./setup.md#using-a-data-transformer).

```tsx twoslash title='pages/posts/[id].tsx'
// @jsx: react-jsx
// @filename: server/context.ts
export declare const prisma: {
  post: {
    findMany: (opts: { select: { id: true } }) => Promise<{ id: string }[]>;
  };
};

// @filename: server/routers/_app.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import superjson from 'superjson';
const t = initTRPC.create({ transformer: superjson });
export const appRouter = t.router({
  post: t.router({
    byId: t.procedure
      .input(z.object({ id: z.string() }))
      .query(() => ({
        id: '1',
        title: 'Example Post',
        text: 'Hello world',
        createdAt: new Date(),
      })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/query-client.ts
import { QueryClient } from '@tanstack/react-query';
export function makeQueryClient() { return new QueryClient(); }

// @filename: utils/trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server/routers/_app';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: pages/posts/[id].tsx
// ---cut---
import { dehydrate, useQuery } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import type {
  GetStaticPaths,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from 'next';
import { prisma } from '../../server/context';
import superjson from 'superjson';
import { appRouter } from '../../server/routers/_app';
import { makeQueryClient } from '../../utils/query-client';
import { useTRPC } from '../../utils/trpc';

export async function getStaticProps(
  context: GetStaticPropsContext<{ id: string }>,
) {
  const id = context.params?.id as string;
  const queryClient = makeQueryClient();
  const trpc = createTRPCOptionsProxy({
    router: appRouter,
    ctx: {},
    queryClient,
  });

  await queryClient.prefetchQuery(trpc.post.byId.queryOptions({ id }));

  return {
    props: {
      trpcState: superjson.serialize(dehydrate(queryClient)),
      id,
    },
    revalidate: 1,
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = await prisma.post.findMany({
    select: {
      id: true,
    },
  });

  return {
    paths: posts.map((post) => ({
      params: {
        id: post.id,
      },
    })),
    // https://nextjs.org/docs/pages/api-reference/functions/get-static-paths#fallback-blocking
    fallback: 'blocking',
  };
};

export default function PostViewPage(
  props: InferGetStaticPropsType<typeof getStaticProps>,
) {
  const trpc = useTRPC();
  const postQuery = useQuery(trpc.post.byId.queryOptions({ id: props.id }));

  switch (postQuery.status) {
    case 'pending':
      return <p>Loading...</p>;
    case 'error':
      return <p>Error: {postQuery.error.message}</p>;
    case 'success': {
      const post = postQuery.data;
      return (
        <article>
          <h1>{post.title}</h1>
          <em>Created {post.createdAt.toLocaleDateString('en-us')}</em>
          <p>{post.text}</p>
        </article>
      );
    }
  }
}
```

## Stop the client from refetching

TanStack React Query refetches stale data on the client when a component mounts, when the window regains focus, and when the network reconnects. If you only want the data from `getStaticProps`, for instance because your API is rate-limited, turn that off.

Per query:

```tsx twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
const appRouter = t.router({
  example: t.procedure.query(() => 'hello'),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.ts
import { createTRPCContext } from '@trpc/tanstack-react-query';
import type { AppRouter } from '../server';
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

// @filename: component.tsx
// ---cut---
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './utils/trpc';

function Example() {
  const trpc = useTRPC();
  const exampleQuery = useQuery(
    trpc.example.queryOptions(undefined, {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }),
  );
}
```

Or for every query, in the query client:

```ts twoslash title='utils/query-client.ts'
import { QueryClient } from '@tanstack/react-query';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });
}
```

Be careful with the second one if your app mixes static and dynamic queries.
