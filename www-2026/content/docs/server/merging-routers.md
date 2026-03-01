---
title: Merging Routers
---

Writing all API-code in your code in the same file is not a great idea. It's easy to merge routers with other routers.

### Defining an inline sub-router

When you define an inline sub-router, you can represent your router as a plain object.

In the below example, `nested1` and `nested2` are equal:

```ts title="server/_app.ts"
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();


export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const router = t.router;

import * as trpc from '@trpc/server';
import { publicProcedure, router } from './trpc';

const appRouter = router({
  // Shorthand plain object for creating a sub-router
  nested1: {
    proc: publicProcedure.query(() => '...'),
  },
  // Equivalent of:
  nested2: router({
    proc : publicProcedure.query(() => '...'),
  }),
});
```

## Merging with child routers

```ts title='server.ts'
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();



export const router = t.router;
export const publicProcedure = t.procedure;

import { router } from '../trpc';
import { z } from 'zod';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = router({
  user: userRouter, // put procedures under "user" namespace
  post: postRouter, // put procedures under "post" namespace
});

// You can then access the merged route with
// http://localhost:3000/trpc/<NAMESPACE>.<PROCEDURE>

export type AppRouter = typeof appRouter;


import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
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

import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const userRouter = router({
  list: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});

```

## Merging with `t.mergeRouters`

If you prefer having all procedures flat in one single namespace, you can instead use `t.mergeRouters`

```ts title='server.ts'
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();


export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;

import { router, publicProcedure, mergeRouters } from '../trpc';
import { z } from 'zod';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = mergeRouters(userRouter, postRouter)

export type AppRouter = typeof appRouter;

import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
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


import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const userRouter = router({
  userList: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});

```

## Dynamically load routers

You can use the `lazy` function to dynamically load your routers. This can be useful to reduce cold starts of your application.

There's no difference in how you use the router after it's been lazy loaded vs. how you use a normal router.

**Example code of lazy loading a router:**

```ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

import { lazy } from '@trpc/server';
import { router } from '../trpc';

export const appRouter = router({
  // Option 1: Short-hand lazy load the greeting router if you have exactly 1 export and it is the router
  greeting: lazy(() => import('./greeting.js')),
  // Option 2: Alternative way to lazy load if you have more than 1 export
  user: lazy(() => import('./user.js').then((m) => m.userRouter)),
});
export type AppRouter = typeof appRouter;

// ----------------------------------------------------
import { router, publicProcedure } from '../trpc';
export const greetingRouter = router({
  hello: publicProcedure.query(() => 'world'),
});

// ----------------------------------------------------
import { router, publicProcedure } from '../trpc';

export const userRouter = router({
  list: publicProcedure.query(() => ['John', 'Jane', 'Jim']),
});
```
