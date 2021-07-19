---
id: useInfiniteQuery
title: useInfiniteQuery
sidebar_label: useInfiniteQuery()
slug: /useInfiniteQuery
---

:::info

- Your procedure needs to accept a `cursor` input of `any` type
- For more details on infinite queries read the [react-query docs](https://react-query.tanstack.com/reference/useInfiniteQuery)
- In this example we're using Prisma - see their docs on [cursor-based pagination](https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination)

:::



## Example Procedure

```tsx
import * as trpc from '@trpc/server';
import { Context } from './[trpc]';

trpc.router<Context>()
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
      let nextCursor: typeof cursor | null = null;
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

```tsx
import { trpc } from '../utils/trpc';

function MyComponent() {
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
