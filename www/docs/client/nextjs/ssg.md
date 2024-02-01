---
id: ssg
title: Static Site Generation
sidebar_label: Static Site Generation (SSG)
slug: /client/nextjs/ssg
---

:::tip
Reference project: https://github.com/trpc/examples-next-prisma-todomvc
:::

Static site generation requires executing tRPC queries inside `getStaticProps` on each page.

This can be done using [server-side helpers](/docs/client/nextjs/server-side-helpers) to prefetch the queries, dehydrate them, and pass it to the page. The queries will then automatically pick up the `trpcState` and use it as an initial value.

## Fetch data in `getStaticProps`

```tsx title='pages/posts/[id].tsx'
import { createServerSideHelpers } from '@trpc/react-query/server';
import {
  GetStaticPaths,
  GetStaticPropsContext,
  InferGetStaticPropsType,
} from 'next';
import { prisma } from 'server/context';
import { appRouter } from 'server/routers/_app';
import superjson from 'superjson';
import { trpc } from 'utils/trpc';

export async function getStaticProps(
  context: GetStaticPropsContext<{ id: string }>,
) {
  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson, // optional - adds superjson serialization
  });
  const id = context.params?.id as string;

  // prefetch `post.byId`
  await helpers.post.byId.prefetch({ id });

  return {
    props: {
      trpcState: helpers.dehydrate(),
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
  const { id } = props;
  const postQuery = trpc.post.byId.useQuery({ id });

  if (postQuery.status !== 'success') {
    // won't happen since we're using `fallback: "blocking"`
    return <>Loading...</>;
  }
  const { data } = postQuery;
  return (
    <>
      <h1>{data.title}</h1>
      <em>Created {data.createdAt.toLocaleDateString('en-us')}</em>

      <p>{data.text}</p>

      <h2>Raw data:</h2>
      <pre>{JSON.stringify(data, null, 4)}</pre>
    </>
  );
}
```

Note that the default behaviour of `react-query` is to refetch the data on the client-side when it mounts, so if you want to _only_ fetch the data via `getStaticProps`, you need to set `refetchOnMount` and `refetchOnWindowFocus` to `false` in the query options.

This might be preferable if you want to minimize the number of requests to your API, which might be necessary if you're using a third-party rate-limited API for example.

This can be done per query:

```tsx
const data = trpc.example.useQuery(
  // if your query takes no input, make sure that you don't
  // accidentally pass the query options as the first argument
  undefined,
  { refetchOnMount: false, refetchOnWindowFocus: false },
);
```

Or globally, if every query across your app should behave the same way:

```tsx title='utils/trpc.ts'
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import superjson from 'superjson';
import type { AppRouter } from './api/trpc/[trpc]';
export const trpc = createTRPCNext<AppRouter>({
  config(opts) {
    return {
      links: [
        httpBatchLink({
          url: `${getBaseUrl()}/api/trpc`,
        }),
      ],
      // Change options globally
      queryClientConfig: {
        defaultOptions: {
          queries: {
            refetchOnMount: false,
            refetchOnWindowFocus: false,
          },
        },
      },
    },
  },
});
```

Be careful with this approach if your app has a mixture of static and dynamic queries.
