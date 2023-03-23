---
id: ssg
title: Static Site Generation
sidebar_label: Static Site Generation (SSG)
slug: /nextjs/ssg
---

:::tip
Reference project: https://github.com/trpc/examples-next-prisma-todomvc
:::

Static site generation requires executing tRPC queries inside `getStaticProps` on each page.

This can be done using [server-side helpers](ssg-helpers) to prefetch the queries, dehydrate them, and pass it to the page. The queries will then automatically pick up the `trpcState` and use it as an initial value.

## Fetch data in `getStaticProps`

```tsx title='pages/posts/[id].tsx'
import { createServerSideHelpers } from '@trpc/react-query/ssg';
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
  const ssg = await createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson, // optional - adds superjson serialization
  });
  const id = context.params?.id as string;

  // prefetch `post.byId`
  await ssg.post.byId.prefetch({ id });

  return {
    props: {
      trpcState: ssg.dehydrate(),
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
    // https://nextjs.org/docs/api-reference/data-fetching/get-static-paths#fallback-blocking
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

Note that the default behaviour of `react-query` is to refetch the data on the client-side when it mounts, so if you want to _only_ fetch the data via `getStaticProps`, you need to set `refetchOnMount`, `refetchOnWindowFocus`, and `refetchOnReconnect` to `false` in the query options. See the [React Query docs](https://tanstack.com/query/latest/docs/react/reference/useQuery) for more info.
