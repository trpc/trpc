---
id: ssg
title: Static Site Generation
sidebar_label: Static Site Generation
slug: /ssg
---

The code here is taken from [`./examples/next-hello-world`](https://github.com/trpc/trpc/tree/main/examples/next-hello-world).

:::info
Reference project: https://github.com/trpc/trpc/tree/main/examples/next-prisma-todomvc
:::

Static site generation requires executing tRPC queries inside

<!-- ### Configure `_app.tsx` for SSG

There's no need to

```tsx
import { withTRPC } from '@trpc/next';
import { AppType } from 'next/dist/next-server/lib/utils';
import { trpcClientOptions } from '../utils/trpc';

const MyApp: AppType = ({ Component, pageProps }) => {
  return <Component {...pageProps} />;
};

export default withTRPC(
  () => {
    return { url: 'http://localhost:5000/trpc' };
  },
  { ssr: false },
)(MyApp);
``` -->

## Fetch data in `getStaticProps`

```tsx
import Head from 'next/head';
import { trpc } from '../utils/trpc';
import { createSSGHelpers } from '@trpc/react/ssg';

export default function Home() {
  const hello = trpc.useQuery(['hello']);

  if (!hello.data) return <div>Loading...</div>;
  return (
    <div>
      <p>{hello.data.greeting}</p>
    </div>
  );
}

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
```
