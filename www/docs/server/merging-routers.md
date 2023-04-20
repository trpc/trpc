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

<!--

### Defining an inline sub-router

When you define an inline sub-router, you can represent your router as a plain object.

In the below example, `nested1` and `nested2` are equal:

```ts twoslash title="server/_app.ts"
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();


export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const router = t.router;

// @filename: _app.ts
// ---cut---
import * as trpc from '@trpc/server';
import { publicProcedure, router } from './trpc';

const appRouter = router({
  // Shorthand plain object for creating a sub-router
  nested1: {
    proc: publicProcedure.query(() => '...'),
  },
  //
  nested2: router({
    proc : publicProcedure.query(() => '...'),
  }),
});
```

:::info

We recommend you always export routers via `t.router`, as opposed to exporting objects with procedures attached. This ensures that type errors show up in the file they originate from, instead of the place where you merge them.

<details style={{ marginTop: "1rem" }}>
<summary>See a deep dive here</summary>

When defining a router as a plain object, any key is valid. This means you can define a router like this, without any errors being shown. But when you try to merge this router somewhere else, things will blow up:

```ts twoslash title="routers/user.ts"
export const userRouter = {
  nested: {
    notAProcedure: () => 'Hello world', // <-- actual error here
  },
};
```

<br />

```ts twoslash title="routers/_app.ts"
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();
const router = t.router;
const userRouter = {
  nested: {
    notAProcedure: () => 'Hello world',
  },
};
// ---cut---
// @errors: 2322
export const appRouter = router({
  user: userRouter, // <-- ❌ error displayed here
});
```

<br />

This can be very confusing, and if your routers are big with lots of procedures, the error message will be impossible to comprehend. To fix this, only use inline sub-routers within a file, and keep the exported routers as a `t.router` object. This way, the error will show up in the file where the error originates from, and not at the place where you merge them:

```ts twoslash title="routers/user.ts"
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();
const router = t.router;
// ---cut---
// @errors: 2322
export const userRouter = router({
  nested: {
    notAProcedure: () => 'Hello world', // <-- ✅ error displayed where it originates
  },
});
```

<br />

```ts twoslash title="routers/_app.ts"
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();
export const router = t.router;

// @errors: 2322
export const userRouter = router({
  nested: {
    notAProcedure: () => 'Hello world',
  },
});
// ---cut---

export const appRouter = router({
  user: userRouter,
});
```

</details>

:::

-->

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
