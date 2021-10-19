---
id: ssg
title: Static Site Generation
sidebar_label: Static Site Generation (SSG)
slug: /ssg
---

:::tip
Reference project: https://github.com/trpc/trpc/tree/main/examples/next-prisma-todomvc
:::

Static site generation requires executing tRPC queries inside `getStaticProps` on each page.

## Fetch data in `getStaticProps`

```tsx
import Head from 'next/head';
import { trpc } from '../utils/trpc';
import { createSSGHelpers } from '@trpc/react/ssg';

// Statically fetch the data in getStaticProps
export const getStaticProps = async (
  context: GetStaticPropsContext<{ filter: string }>,
) => {
  const ssg = createSSGHelpers({
    router: appRouter,
    transformer, // optional
    ctx: {},
  });

  await ssg.fetchQuery('hello');
  await ssg.fetchQuery('hello', { text: 'client' });

  return {
    props: {
      trpcState: ssg.dehydrate(),
    },
    revalidate: 1,
  };
};

export default function Home() {
  // Retrieve data from the cache, if available. Otherwise make an HTTP request, as normal.
  const hello = trpc.useQuery(['hello']);
  
  if (!hello.data) return <div>Loading...</div>;
  return (
    <div>
      <p>{hello.data.greeting}</p>
    </div>
  );
}

```
