---
id: createTRPCQueryUtils
title: createTRPCQueryUtils
sidebar_label: createTRPCQueryUtils()
slug: /client/react/createTRPCQueryUtils
---

Similar to `useUtils`, `createTRPCQueryUtils` is a function that gives you access to helpers that let you manage the cached data of the queries you execute via `@trpc/react-query`. These helpers are actually thin wrappers around `@tanstack/react-query`'s [`queryClient`](https://tanstack.com/query/v5/docs/reference/QueryClient) methods. If you want more in-depth information about options and usage patterns for `useUtils` helpers than what we provide here, we will link to their respective `@tanstack/react-query` docs so you can refer to them accordingly.

:::note

The difference between `useUtils` and `createTRPCQueryUtils` is that `useUtils` is a react hook that uses `useQueryClient` under the hood. This means that it is able to work better within React Components.
The use case for `createTRPCQueryUtils` is when you need to use the helpers outside of a React Component, for example in react-router's loaders.

:::

:::caution

You should avoid using `createTRPCQueryUtils` in React Components. Instead, use `useUtils` which is a React hook that implements `useCallback` and `useQueryClient` under the hood.

:::

## Usage

`createTRPCQueryUtils` returns an object with all the available queries you have in your routers. You use it the same way as your `trpc` client object. Once you reach a query, you'll have access to the query helpers. For example, let's say you have a `post` router with an `all` query:

```twoslash include server
// @target: esnext
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  post: t.router({
    all: t.procedure.query(() => {
      return {
        posts: [
          { id: 1, title: 'everlong' },
          { id: 2, title: 'After Dark' },
        ],
      };
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

Now in our component, when we navigate the object `createTRPCQueryUtils` gives us and reach the `post.all` query, we'll get access to our query helpers!

```tsx title="MyPage.tsx"
import { QueryClient } from '@tanstack/react-query';
import { createTRPCQueryUtils, createTRPCReact } from '@trpc/react-query';
import { useLoaderData } from 'react-router-dom';
import type { AppRouter } from './server';

const trpc = createTRPCReact<AppRouter>();
const trpcClient = trpc.createClient({ links: [] });

const queryClient = new QueryClient();

const clientUtils = createTRPCQueryUtils({ queryClient, client: trpcClient });

// This is a react-router loader
export async function loader() {
  const allPostsData = await clientUtils.post.all.ensureData(); // Fetches data if it doesn't exist in the cache

  return {
    allPostsData,
  };
}

// This is a react component
export function Component() {
  const loaderData = useLoaderData() as Awaited<ReturnType<typeof loader>>;

  const allPostQuery = trpc.post.all.useQuery({
    initialData: loaderData.allPostsData, // Uses the data from the loader
  });

  return (
    <div>
      {allPostQuery.data.posts.map((post) => (
        <div key={post.id}>{post.title}</div>
      ))}
    </div>
  );
}
```

:::note

If you were using Remix Run or SSR you wouldn't re-use the same `queryClient` for every request. Instead, you would create a new `queryClient` for every request so that there's no cross-request data leakage.

:::

## Helpers

Much like `useUtils`, `createTRPCQueryUtils` gives you access to same set of helpers. The only difference is that you need to pass in the `queryClient` and `client` objects.

You can see them on the [useUtils](/docs/client/react/useUtils) page.
