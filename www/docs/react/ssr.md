---
id: ssr
title: Server-side Rendering (SSR / SSG)
sidebar_label: Server-side Rendering (SSR / SSG)
slug: /ssr
---


:::info
- Working examples:
  - [examples/next-ssg-chat](https://github.com/trpc/trpc/tree/main/examples/next-ssg-chat)
  - [examples/next-hello-world](https://github.com/trpc/trpc/tree/main/examples/next-hello-world)
- Follow [Next.js-guide](nextjs) before doing the below

:::


## Option 1: Using `ssr.prefetchOnServer()` (recommended)



### In `getStaticProps`

```tsx
import { trpc } from '../utils/trpc'
 // Important - only ever import & use your `appRouter` in the SSR-methods
import { appRouter } from './api/trpc/[trpc]';

export async function getStaticProps() {
  // Create SSR helpers with your app's router and context object
  const ssr = trpc.ssr(appRouter, {});

  await ssr.prefetchInfiniteQuery('messages.list', { limit: 100 });
  // or `await ssr.prefetchQuery('messages.list', { limit: 100 });`

  return {
    props: {
      dehydratedState: ssr.dehydrate(),
    },
  };
}
```


This will cache the `messages.list` so it's instant when `useQuery(['message.list', { limit: 100 }])` gets called.


### Option 2: Invoking directly

You can also invoke a procedure directly and get the data in a promise.

#### In `getStaticProps`

```tsx
// Important - only ever import & use your `appRouter` in the SSR-methods
import { appRouter } from './api/trpc/[trpc]'; 
import { trpc } from '../utils/trpc'

export async function getStaticProps() {
  // Create SSR helpers with your app's router and context object
  const ssr = trpc.ssr(appRouter, {});

  const allPosts = await ssr.caller.query('allPosts', { limit: 100 })

  return {
    props: {
      allPosts,
    },
  };
}
```

