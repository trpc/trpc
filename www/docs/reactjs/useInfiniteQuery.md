---
id: useInfiniteQuery
title: useInfiniteQuery
sidebar_label: useInfiniteQuery()
slug: /reactjs/useinfinitequery
---

:::info

- Your procedure needs to accept a `cursor` input of any type (`string`, `number`, etc) to expose this hook.
- For more details on infinite queries read the [react-query docs](https://react-query.tanstack.com/reference/useInfiniteQuery)
- In this example we're using Prisma - see their docs on [cursor-based pagination](https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination)

:::

## Example Procedure

```tsx title='server/routers/_app.ts'
import { initTRPC } from '@trpc/server'
import { Context } from './[trpc]';

export const t = initTRPC.create()

export const appRouter = t.router({
  infinitePosts: t
    .procedure
    .input(z.object({
      limit: z.number().min(1).max(100).nullish(),
      cursor: z.number().nullish(), // <-- "cursor" needs to exist, but can be any type
    }))
    .query(({ input }) => {
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
})
```

## Example React Component

```tsx title='components/MyComponent.tsx'
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const myQuery = trpc.infinitePosts.useInfiniteQuery(
    {
      limit: 10,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      // initialCursor: 1, // <-- optional you can pass an initialCursor
    },
  );
  // [...]
}
```

## Helpers

### `getInfiniteData()`

This helper gets the currently cached data from an existing infinite query

```tsx title='components/MyComponent.tsx'
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const utils = trpc.useContext();

  const myMutation = trpc.infinitePosts.add.useMutation({
    async onMutate({ post }) {
      await utils.infinitePosts.cancel();
      const allPosts = utils.infinitePosts.getInfiniteData({ limit: 10 });
      // [...]
    },
  });
}
```

### `setInfiniteData()`

This helper allows you to update a query's cached data

```tsx title='components/MyComponent.tsx'
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const utils = trpc.useContext();

  const myMutation = trpc.infinitePosts.delete.useMutation({
    async onMutate({ post }) {
      await utils.infinitePosts.cancel();

      utils.infinitePosts.setInfiniteData({ limit: 10 }, (data) => {
        if (!data) {
          return {
            pages: [],
            pageParams: [],
          };
        }

        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.status === 'published'),
          })),
        };
      });
    },
  });

  // [...]
}
```
