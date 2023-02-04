---
id: merging-routers
title: Merging Routers
sidebar_label: Merging Routers
slug: /merging-routers
---

Writing all API-code in your code in the same file is not a great idea. It's easy to merge routers with other routers.

## Merging with child routers

```ts twoslash title='server.ts'
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();


export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;

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
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const postRouter = router({
  create: publicProcedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //          ^?
      // [...]
    }),
  list: publicProcedure.query(() => {
    // ...
    return [];
  }),
});

// @filename: routers/user.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const userRouter = router({
  list: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});

```

Under the hood, nested procedure paths are strings in dot notation (`'.'` as delimiter) that contain the procedure name preceeded by all namespaces in the path from the root router.

```ts title='client.ts'
const users = await client.user.list.query(); // => [];
// underlying path is "user.list"
```

You can also configure a custom namespace delimiter:

```ts twoslash title='server.ts'
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create({
  namespaceDelimiter: '/' as const,
});

export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: routers/_app.ts
import { router } from '../trpc';
import { z } from 'zod';

import { userRouter } from './user';

const appRouter = router({
  user: userRouter,
});

export type AppRouter = typeof appRouter;

// @filename: routers/user.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const userRouter = router({
  list: publicProcedure.query(() => {
    return [];
  }),
});
```

```ts title='client.ts'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../server/trpc';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
  namespaceDelimiter: '/', // this has to match the delimiter on the server
});

const users = await client.user.list.query(); // => [];
// underlying path is "user/list"
```

**Note**: Choosing a custom namespace delimiter is a must when using AWS HTTP APIs since dots are not allowed in paths.

## Merging with `t.mergeRouters`

If you prefer having all procedures flat in one single namespace, you can instead use `t.mergeRouters`

```ts twoslash title='server.ts'
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();


export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;



// ---cut---

// @filename: routers/_app.ts
import { router, publicProcedure, mergeRouters } from '../trpc';
import { z } from 'zod';

import { userRouter } from './user';
import { postRouter } from './post';

const appRouter = mergeRouters(userRouter, postRouter)

export type AppRouter = typeof appRouter;

// @filename: routers/post.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const postRouter = router({
  postCreate: publicProcedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //          ^?
      // [...]
    }),
  postList: publicProcedure.query(() => {
    // ...
    return [];
  }),
});


// @filename: routers/user.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
export const userRouter = router({
  userList: publicProcedure.query(() => {
    // [..]
    return [];
  }),
});

```
