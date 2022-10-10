---
id: merging-routers
title: Merging Routers
sidebar_label: Merging Routers
slug: /merging-routers
---

Writing all API-code in your code in the same file is not a great idea. It's easy to merge routers with other routers.

Thanks to TypeScript 4.1 template literal types we can also prefix the procedures without breaking typesafety.

## Merging with child routers

```ts twoslash title='server.ts'
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();


export const middleware = t.middleware;
export const router = t.router;
export const procedure = t.procedure;

// @filename: routers/_app.ts
import { router } from '../trpc';
import { z } from 'zod';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = router({
  user: userRouter, // put procedures under "user" namespace
  post: postRouter, // put procedures under "post" namespace
});

export type AppRouter = typeof appRouter;


// @filename: routers/post.ts
import { router, procedure } from '../trpc';
import { z } from 'zod';
export const postRouter = router({
  create: procedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //          ^?
      // [...]
    }),
  list: procedure.query(() => {
    // ...
    return [];
  }),
});

// @filename: routers/user.ts
import { router, procedure } from '../trpc';
import { z } from 'zod';
export const userRouter = router({
  list: procedure.query(() => {
    // [..]
    return [];
  }),
});

```

## Merging with `t.mergeRouters`

If you prefer having all procedures flat in your router, you can instead use `t.mergeRouters`



```ts twoslash title='server.ts'
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();


export const middleware = t.middleware;
export const router = t.router;
export const procedure = t.procedure;
export const mergeRouters = t.mergeRouters;



// ---cut---

// @filename: routers/_app.ts
import { router, procedure, mergeRouters } from '../trpc';
import { z } from 'zod';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = mergeRouters(userRouter, postRouter)

export type AppRouter = typeof appRouter;

// @filename: routers/post.ts
import { router, procedure } from '../trpc';
import { z } from 'zod';
export const postRouter = router({
  postCreate: procedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //          ^?
      // [...]
    }),
  postList: procedure.query(() => {
    // ...
    return [];
  }),
});


// @filename: routers/user.ts
import { router, procedure } from '../trpc';
import { z } from 'zod';
export const userRouter = router({
  userList: procedure.query(() => {
    // [..]
    return [];
  }),
});

```