---
id: merging-routers
title: Merging Routers
sidebar_label: Merging Routers
slug: /server/merging-routers
---

Writing all API-code in your code in the same file is not a great idea. It's easy to merge routers with other routers.

## Merging with child routers

```ts twoslash title='server.ts'
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
import { z, z, z } from 'zod';
// @filename: routers/_app.ts

// @filename: routers/post.ts

// @filename: routers/user.ts
import {
  publicProcedure,
  publicProcedure,
  router,
  router,
  router,
} from '../trpc';
import { postRouter } from './post';
import { userRouter } from './user';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

const appRouter = router({
  user: userRouter, // put procedures under "user" namespace
  post: postRouter, // put procedures under "post" namespace
});

// You can then access the merged route with
// http://localhost:3000/trpc/<NAMESPACE>.<PROCEDURE>

export type AppRouter = typeof appRouter;

export const postRouter = router({
  create: publicProcedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation((opts) => {
      const { input } = opts;
      //        ^?
      // [...]
    }),
  list: publicProcedure.query(() => {
    // ...
    return [];
  }),
});

export const userRouter = router({
  list: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});
```

## Merging with `t.mergeRouters`

If you prefer having all procedures flat in one single namespace, you can instead use `t.mergeRouters`

```ts twoslash title='server.ts'
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
import { z, z, z } from 'zod';
// @filename: routers/_app.ts

// @filename: routers/post.ts

// @filename: routers/user.ts
import {
  mergeRouters,
  publicProcedure,
  publicProcedure,
  publicProcedure,
  router,
  router,
  router,
} from '../trpc';
import { postRouter } from './post';
import { userRouter } from './user';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;

const appRouter = mergeRouters(userRouter, postRouter);

export type AppRouter = typeof appRouter;

export const postRouter = router({
  postCreate: publicProcedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation((opts) => {
      const { input } = opts;
      //        ^?
      // [...]
    }),
  postList: publicProcedure.query(() => {
    // ...
    return [];
  }),
});

export const userRouter = router({
  userList: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});
```
