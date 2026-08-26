---
id: merging-routers
title: Merging Routers
sidebar_label: Merging Routers
slug: /server/merging-routers
---

Writing all API-code in the same file can become unwieldy. It's easy to merge routers together in order to break them up.

## Merging with child routers

```twoslash include trpcbase
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;
```

```ts twoslash title='routers/user.ts'
// @filename: trpc.ts
// @include: trpcbase
// @filename: routers/user.ts
// ---cut---
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const userRouter = router({
  list: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});
```

```ts twoslash title='routers/post.ts'
// @filename: trpc.ts
// @include: trpcbase
// @filename: routers/post.ts
// ---cut---
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

```ts twoslash title='routers/_app.ts'
// @filename: trpc.ts
// @include: trpcbase
// @filename: routers/user.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const userRouter = router({ list: publicProcedure.query(() => { return []; }) });
// @filename: routers/post.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const postRouter = router({ create: publicProcedure.input(z.object({ title: z.string() })).mutation((opts) => {}), list: publicProcedure.query(() => { return []; }) });
// @filename: routers/_app.ts
// ---cut---
import { router } from '../trpc';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = router({
  user: userRouter,
  post: postRouter,
});

appRouter.user
//         ^?

appRouter.post
//         ^?

export type AppRouter = typeof appRouter;
```

## Merging with `t.mergeRouters`

If you prefer having all procedures flat in one single namespace, you can instead use `t.mergeRouters`

```ts twoslash title='routers/user.ts'
// @filename: trpc.ts
// @include: trpcbase
// @filename: routers/user.ts
// ---cut---
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const userRouter = router({
  userList: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});
```

```ts twoslash title='routers/post.ts'
// @filename: trpc.ts
// @include: trpcbase
// @filename: routers/post.ts
// ---cut---
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

```ts twoslash title='routers/_app.ts'
// @filename: trpc.ts
// @include: trpcbase
// @filename: routers/user.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const userRouter = router({ userList: publicProcedure.query(() => { return []; }) });
// @filename: routers/post.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const postRouter = router({ postCreate: publicProcedure.input(z.object({ title: z.string() })).mutation((opts) => {}), postList: publicProcedure.query(() => { return []; }) });
// @filename: routers/_app.ts
// ---cut---
import { mergeRouters } from '../trpc';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = mergeRouters(userRouter, postRouter);
//        ^?

export type AppRouter = typeof appRouter;
```

## Dynamically load routers {#lazy-load}

You can use the `lazy` function to dynamically load your routers. This can be useful to reduce cold starts of your application. There's no difference in how you use the router after it's been lazy loaded vs. how you use a normal router.

```twoslash include lazytrpc
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

```ts twoslash title='routers/greeting.ts'
// @target: esnext
// @filename: trpc.ts
// @include: lazytrpc
// @filename: routers/greeting.ts
// ---cut---
import { router, publicProcedure } from '../trpc';

export const greetingRouter = router({
  hello: publicProcedure.query(() => 'world'),
});
```

```ts twoslash title='routers/user.ts'
// @target: esnext
// @filename: trpc.ts
// @include: lazytrpc
// @filename: routers/user.ts
// ---cut---
import { router, publicProcedure } from '../trpc';

export const userRouter = router({
  list: publicProcedure.query(() => ['John', 'Jane', 'Jim']),
});
```

```ts twoslash title='routers/_app.ts'
// @target: esnext
// @filename: trpc.ts
// @include: lazytrpc
// @filename: routers/greeting.ts
import { router, publicProcedure } from '../trpc';
export const greetingRouter = router({ hello: publicProcedure.query(() => 'world') });
// @filename: routers/user.ts
import { router, publicProcedure } from '../trpc';
export const userRouter = router({ list: publicProcedure.query(() => ['John', 'Jane', 'Jim']) });
// @filename: routers/_app.ts
// ---cut---
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
