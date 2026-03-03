---
id: useInfiniteQuery
title: useInfiniteQuery
sidebar_label: useInfiniteQuery()
slug: /useInfiniteQuery
---

:::info

- Your procedure needs to accept a `cursor` input of `any` type
- For more details on infinite queries read the [react-query docs](https://tanstack.com/query/v3/docs/react/reference/useInfiniteQuery)
- In this example we're using Prisma - see their docs on [cursor-based pagination](https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination)

:::

## Example Procedure

```tsx title='server/routers/_app.ts'
import * as trpc from '@trpc/server';
import { Context } from './[trpc]';
import { z } from 'zod';

export const appRouter = trpc.router<Context>()
  .query('infinitePosts', {
    input: z.object({
      limit: z.number().min(1).max(100).nullish(),
      cursor: z.number().nullish(), // <-- "cursor" needs to exist, but can be any type
    }),
    async resolve({ input }) {
      const limit = input.limit ?? 50;
      const { cursor } = input;
      const items = await prisma.post.findMany({
        take: limit + 1, // get an extra item at the end which we'll use as next cursor
        where: {
          title: {
            contains: 'Prisma' /* Optional filter */,
          },
        },
        cursor: cursor ? { myCursor: cursor } : undefined,
        orderBy: {
          myCursor: 'asc',
        },
      })
      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop()
        nextCursor = nextItem!.myCursor;
      }

      return {
        items,
        nextCursor,
      };
    })
```

## Example React Component

```tsx title='components/MyComponent.tsx'
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const myQuery = trpc.useInfiniteQuery(
    [
      'infinitePosts',
      {
        limit: 10,
      },
    ],
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    },
  );
  // [...]
}
```

## Helpers

### `getInfiniteQueryData()`

This helper gets the currently cached data from an existing infinite query

```tsx title='components/MyComponent.tsx'
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const utils = trpc.useContext();

  const myMutation = trpc.useMutation('infinitePosts.add', {
    onMutate({ post }) {
      await utils.cancelQuery(['infinitePosts']);
      const allPosts = utils.getInfiniteQueryData(['infinitePosts', { limit: 10 }]);
      // [...]
    }
  })
}
```

### `setInfiniteQueryData()`

This helper allows you to update a queries cached data

```tsx title='components/MyComponent.tsx'
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const utils = trpc.useContext();

  const myMutation = trpc.useMutation('infinitePosts.delete', {
    onMutate({ post }) {
      await utils.cancelQuery(['infinitePosts']);

      utils.setInfiniteQueryData(['infinitePosts', { limit: 10 }], (data) => {
        if (!data) {
          return {
            pages: [],
            pageParams: []
          }
        }

        return {
          ...data,
          pages: data.pages.map((page) => {
            ...page,
            items: page.items.filter((item) => item.status === 'published')
          })
        }
      });
    }
  });

  // [...]
}


```
