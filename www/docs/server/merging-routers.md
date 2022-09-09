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
export const t = initTRPC.create();


// ---cut---

// @filename: routers/_app.ts
import { t } from '../trpc';
import { z } from 'zod';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = t.router({
  user: userRouter, // put procedures under "user" namespace
  post: postRouter, // put procedures under "post" namespace
});

export type AppRouter = typeof appRouter;


// @filename: routers/post.ts
import { t } from '../trpc';
import { z } from 'zod';
export const postRouter = t.router({
  create: t.procedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //          ^?
      // [...]
    }),
  list: t.procedure.query(() => {
    // ...
    return [];
  }),
});

// @filename: routers/user.ts
import { t } from '../trpc';
import { z } from 'zod';
export const userRouter = t.router({
  list: t.procedure.query(() => {
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
export const t = initTRPC.create();


// ---cut---

// @filename: routers/_app.ts
import { t } from '../trpc';
import { z } from 'zod';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = t.mergeRouters(userRouter, postRouter)

export type AppRouter = typeof appRouter;

// @filename: routers/post.ts
import { t } from '../trpc';
import { z } from 'zod';
export const postRouter = t.router({
  postCreate: t.procedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //          ^?
      // [...]
    }),
  postList: t.procedure.query(() => {
    // ...
    return [];
  }),
});


// @filename: routers/user.ts
import { t } from '../trpc';
import { z } from 'zod';
export const userRouter = t.router({
  userList: t.procedure.query(() => {
    // [..]
    return [];
  }),
});

```