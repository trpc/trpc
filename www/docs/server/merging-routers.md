---
id: merging-routers
title: Merging Routers
sidebar_label: Merging Routers
slug: /server/merging-routers
---

Writing all API-code in your code in the same file is not a great idea. It's easy to merge routers with other routers.

### Defining an inline sub-router {#inline-sub-router}

When you define an inline sub-router, you can represent your router as a plain object.

In the below example, `nested1` and `nested2` are equal:

```ts twoslash title="server/_app.ts"
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
// @filename: _app.ts
// ---cut---
import * as trpc from '@trpc/server';
import { publicProcedure, router } from './trpc';

const t = initTRPC.create();

export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const router = t.router;

const appRouter = router({
  // Shorthand plain object for creating a sub-router
  nested1: {
    proc: publicProcedure.query(() => '...'),
  },
  // Equivalent of:
  nested2: router({
    proc: publicProcedure.query(() => '...'),
  }),
});
```

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

## Dynamically load routers {#lazy-load}

You can use the `lazy` function to dynamically load your routers. This can be useful to reduce cold starts of your application.

There's no difference in how you use the router after it's been lazy loaded vs. how you use a normal router.

**Example code of lazy loading a router:**

```ts twoslash
// @target: esnext
// @filename: trpc.ts
// ---cut---
// @filename: routers/_app.ts
import { initTRPC, lazy } from '@trpc/server';
// ----------------------------------------------------
// @filename: routers/greeting.ts

// ----------------------------------------------------
// @filename: routers/user.ts
import {
  publicProcedure,
  publicProcedure,
  router,
  router,
  router,
} from '../trpc';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const appRouter = router({
  // Option 1: Short-hand lazy load the greeting router if you have exactly 1 export and it is the router
  greeting: lazy(() => import('./greeting.js')),
  // Option 2: Alternative way to lazy load if you have more than 1 export
  user: lazy(() => import('./user.js').then((m) => m.userRouter)),
});
export type AppRouter = typeof appRouter;

export const greetingRouter = router({
  hello: publicProcedure.query(() => 'world'),
});

export const userRouter = router({
  list: publicProcedure.query(() => ['John', 'Jane', 'Jim']),
});
```
