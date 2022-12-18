---
id: usequeries
title: useQueries()
sidebar_label: useQueries()
slug: /use-queries
---

The useQueries hook is used to fetch multiple queries using one hook call. This hook is an excellent choice in scenarios where you fetch numerous queries in one component as it can lead to a cleaner and more readable code.

## Usage

The useQueries hook is the same as that of [@tanstack/query useQueries](https://tanstack.com/query/v4/docs/react/reference/useQueries). The only difference is that you pass in a function that returns an array of queries instead of an array of queries inside an object parameter.

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
  greeting: t.procedure
    .input(
      z.object({
        text: z.string().nullish(),
      })
    )
    .query(({ input }) => {
      return {
        message: `Hello ${input.text ?? 'World'}`
      }
    })
});

export type AppRouter = typeof appRouter;


// @filename: utils/trpc.tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server';

export const trpc = createTRPCReact<AppRouter>();

```

```tsx twoslash
// @target: esnext
// @include: server
// ---cut---
// @filename: pages/index.tsx
import React from 'react';
import { trpc } from '../utils/trpc';

function PostView() {
  const data = trpc.greeting.useQuery({});
  //      ^?

  return <>{/* ... */}</>;
}
```

### Providing options to individual queries

You can also pass in any normal query options to the second parameter of any of the query calls in the array such as `enabled`, `suspense`, `refetchOnWindowFocus`...etc. For a complete overview of all the available options, see the [tanstack useQuery](https://tanstack.com/query/v4/docs/react/reference/useQuery) documentation.

```tsx
const Component = () => {
  const [post, greeting] = trpc.useQueries((t) => [
    t.post.byId({ id: '1' }, { enabled: false }),
    t.greeting({ text: 'world' }),
  ]);

  const onButtonClick = () => {
    post.refetch();
  };

  return (
    <div>
      <h1>{post.data && post.data.title}</h1>
      <p>{greeting.data.message}</p>
      <button onClick={onButtonClick}>Click to fetch</button>
    </div>
  );
};
```

### Context

You can also pass in an optional React Query context to override the default.

```tsx
const [post, greeting] = trpc.useQueries(
  (t) => [t.post.byId({ id: '1' }), t.greeting({ text: 'world' })],
  myCustomContext,
);
```
