---
id: server-side-calls
title: Server Side Calls
sidebar_label: Server Side Calls
slug: /server-side-calls
---

You may need to call your procedure(s) directly from the server, `createCaller()` function returns you an instance of `RouterCaller` able to execute queries and mutations.

## Create caller

With the `router.createCaller({})` function (first argument is `Context`) we retrieve an instance of `RouterCaller`.

### Input query example

We create the router with a input query and then we call the asynchronous `greeting` procedure to get the result.

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const router = t.router({
  // Create procedure at path 'greeting'
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello ${input.name}`),
});

const caller = router.createCaller({});
const result = await caller.greeting({ name: 'tRPC' });
//     ^?
```

### Mutation example

We create the router with a mutation and then we call the asynchronous `post` procedure to get the result.

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const posts = ['One', 'Two', 'Three'];

const t = initTRPC.create();
const router = t.router({
  post: t.router({
    add: t.procedure.input(z.string()).mutation(({ input }) => {
      posts.push(input);
      return posts;
    }),
  }),
});

const caller = router.createCaller({});
const result = await caller.post.add('Four');
//     ^?
```

### Context with middleware example

We create a middleware to check the context before execute `secret` procedure.
Below two examples, the former fails because the context doesn't fit the middleware logic the latter works correctly.

<br/>

:::info

Middlewares are performed before any procedure(s) are called.

:::

<br/>

```ts twoslash
// @target: esnext
import { TRPCError, initTRPC } from '@trpc/server';

type Context = {
  user?: {
    id: string;
  };
};
const t = initTRPC.context<Context>().create();

const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You are not authorized',
    });
  }

  return next({
    ctx: {
      // Infers that the `user` is non-nullable
      user: ctx.user,
    },
  });
});

const protectedProcedure = t.procedure.use(isAuthed);

const router = t.router({
  secret: protectedProcedure.query(({ ctx }) => ctx.user),
});

{
  // ❌ this will return an error because there isn't the right context param
  const caller = router.createCaller({});

  const result = await caller.secret();
}

{
  // ✅ this will work because user property is present inside context param
  const authorizedCaller = router.createCaller({
    user: {
      id: 'KATT',
    },
  });
  const result = await authorizedCaller.secret();
  //     ^?
}
```
