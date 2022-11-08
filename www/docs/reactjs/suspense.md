---
id: suspense
title: Suspense (Experimental)
sidebar_label: Suspense (Experimental)
slug: /suspense
---


:::caution
- `useSuspense` & `useSuspenseInfiniteQuery` are *experimental* features as its implementation may change as a result of the [`use()` proposal & RSC (React Server Components)](https://github.com/reactjs/rfcs/pull/229)
- Ensure you're on on React 18.2.0 in order for this to work in SSR
- When initializing `createTRPCReact` or `createTRPCNext`  you have to pass `'ExperimentalSuspense'` as the **third** generic parameter

:::

### Example


```twoslash include server
// @target: esnext

// @filename: server.ts
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const posts = [
  { id: '1', title: 'everlong' },
  { id: '2', title: 'After Dark' },
];

const appRouter = t.router({
  post: t.router({
    all: t.procedure
      .input(
        z.object({ 
          cursor: z.string().nullish(),
        })
      )
      .query(({ input }) => {
        return {
          posts,
          nextCursor: '123' as string | undefined,
        };
      }),
    byId: t.procedure
      .input(
        z.object({ 
          id: z.string(),
        })
      )
      .query(({ input }) => {
        const post = posts.find(p => p.id === input.id);
        if (!post) {
          throw new TRPCError({
            code: 'NOT_FOUND',
          })
        }
        return post;
     }),
  }),
});

export type AppRouter = typeof appRouter;
```


```tsx twoslash
// @target: esnext
// @include: server

// ---cut---

// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';

export const trpc = createTRPCReact<AppRouter, unknown, 'ExperimentalSuspense'>();

// @filename: pages/index.tsx
import { trpc } from '../utils/trpc';
import React from 'react';

function PostView() {
  const [post, postQuery] = trpc.post.byId.useSuspenseQuery({ id: "1" });
  //      ^?
  // [...]
  return <>..</>
}
```
