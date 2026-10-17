---
title: "Merging Routers"
description: ""
section: "Backend Usage"
order: 12
---

Writing all API-code in the same file can become unwieldy. It's easy to merge routers together in order to break them up.

## Merging with child routers

```ts title="routers/user.ts"
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const userRouter = router({
  list: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});
```

```ts title="routers/post.ts"
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
      // [...]
    }),
  list: publicProcedure.query(() => {
    // ...
    return [];
  }),
});
```

```ts title="routers/_app.ts"
import { router } from '../trpc';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = router({
  user: userRouter,
  post: postRouter,
});

appRouter.user

appRouter.post

export type AppRouter = typeof appRouter;
```

## Merging with `t.mergeRouters`

If you prefer having all procedures flat in one single namespace, you can instead use `t.mergeRouters`

```ts title="routers/user.ts"
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const userRouter = router({
  userList: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});
```

```ts title="routers/post.ts"
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
      // [...]
    }),
  postList: publicProcedure.query(() => {
    // ...
    return [];
  }),
});
```

```ts title="routers/_app.ts"
import { mergeRouters } from '../trpc';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = mergeRouters(userRouter, postRouter);

export type AppRouter = typeof appRouter;
```

## Dynamically load routers {#lazy-load}

You can use the `lazy` function to dynamically load your routers. This can be useful to reduce cold starts of your application. There's no difference in how you use the router after it's been lazy loaded vs. how you use a normal router.

```ts title="routers/greeting.ts"
import { router, publicProcedure } from '../trpc';

export const greetingRouter = router({
  hello: publicProcedure.query(() => 'world'),
});
```

```ts title="routers/user.ts"
import { router, publicProcedure } from '../trpc';

export const userRouter = router({
  list: publicProcedure.query(() => ['John', 'Jane', 'Jim']),
});
```

```ts title="routers/_app.ts"
import { lazy } from '@trpc/server';
import { router } from '../trpc';

export const appRouter = router({
  // Option 1: Short-hand when the module has exactly 1 router exported
  greeting: lazy(() => import('./greeting.js')),
  // Option 2: if exporting more than 1 router
  user: lazy(() => import('./user.js').then((m) => m.userRouter)),
});
export type AppRouter = typeof appRouter;
```
