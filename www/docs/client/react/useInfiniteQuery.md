---
id: useInfiniteQuery
title: useInfiniteQuery
sidebar_label: useInfiniteQuery()
slug: /client/react/useInfiniteQuery
---

:::info

- Your procedure needs to accept a `cursor` input of any type (`string`, `number`, etc) to expose this hook.
- For more details on infinite queries read the [react-query docs](https://tanstack.com/query/v5/docs/framework/react/reference/useInfiniteQuery)
- In this example we're using Prisma - see their docs on [cursor-based pagination](https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination)

:::

## Example Procedure

```tsx twoslash title='server/routers/_app.ts'
// ---cut---
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

// @filename: server/routers/_app.ts
declare const prisma: {
  post: {
    findMany: (opts: any) => Promise<{ myCursor: number }[]>;
  };
};

export const t = initTRPC.create();

export const appRouter = t.router({
  infinitePosts: t.procedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.number().nullish(), // <-- "cursor" needs to exist, but can be any type
        direction: z.enum(['forward', 'backward']), // optional, useful for bi-directional query
      }),
    )
    .query(async (opts) => {
      const { input } = opts;
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
      });
      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        const nextItem = items.pop();
        nextCursor = nextItem!.myCursor;
      }

      return {
        items,
        nextCursor,
      };
    }),
});
```

## Example React Component

```tsx twoslash title='components/MyComponent.tsx'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  infinitePosts: t.procedure
    .input(z.object({
      limit: z.number().min(1).max(100).nullish(),
      cursor: z.number().nullish(),
      direction: z.enum(['forward', 'backward']),
    }))
    .query(({ input }) => {
      return {
        items: [] as { id: string; title: string }[],
        nextCursor: 1 as number | undefined,
      };
    }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';
export const trpc = createTRPCReact<AppRouter>();

// @filename: components/MyComponent.tsx
// ---cut---
import React from 'react';
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

```tsx twoslash title='components/MyComponent.tsx'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  infinitePosts: t.router({
    list: t.procedure
      .input(z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.number().nullish(),
        direction: z.enum(['forward', 'backward']).optional(),
      }))
      .query(({ input }) => {
        return {
          items: [] as { id: string; title: string; status: string }[],
          nextCursor: 1 as number | undefined,
        };
      }),
    add: t.procedure
      .input(z.object({ title: z.string() }))
      .mutation(({ input }) => {
        return { id: '1', title: input.title };
      }),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';
export const trpc = createTRPCReact<AppRouter>();

// @filename: components/MyComponent.tsx
// ---cut---
import React from 'react';
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const utils = trpc.useUtils();

  const myMutation = trpc.infinitePosts.add.useMutation({
    async onMutate(opts) {
      await utils.infinitePosts.list.cancel();
      const allPosts = utils.infinitePosts.list.getInfiniteData({ limit: 10 });
      // [...]
    },
  });
}
```

### `setInfiniteData()`

This helper allows you to update a query's cached data

```tsx twoslash title='components/MyComponent.tsx'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
const t = initTRPC.create();
const appRouter = t.router({
  infinitePosts: t.router({
    list: t.procedure
      .input(z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.number().nullish(),
        direction: z.enum(['forward', 'backward']).optional(),
      }))
      .query(({ input }) => {
        return {
          items: [] as { id: string; title: string; status: string }[],
          nextCursor: 1 as number | undefined,
        };
      }),
    delete: t.procedure
      .input(z.object({ id: z.string() }))
      .mutation(({ input }) => {
        return { id: input.id };
      }),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';
export const trpc = createTRPCReact<AppRouter>();

// @filename: components/MyComponent.tsx
// ---cut---
import React from 'react';
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const utils = trpc.useUtils();

  const myMutation = trpc.infinitePosts.delete.useMutation({
    async onMutate(opts) {
      await utils.infinitePosts.list.cancel();

      utils.infinitePosts.list.setInfiniteData({ limit: 10 }, (data) => {
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
