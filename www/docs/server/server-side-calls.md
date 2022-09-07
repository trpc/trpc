---
id: server-side-calls
title: Server Side Calls
sidebar_label: Server Side Calls
slug: /server-side-calls
---

You may need to call your procedure(s) directly from the server, `createCaller()` function returns you an instance of `RouterCaller` able to execute query(ies) and mutation(s).

## Create caller

In every examples, after tRPC initialization, we generate the router.<br/>
Then with `router.createCaller({})` function (param of this Context) we retrieve an instance of `RouterCaller`.

### Input query example

We create the router with a input query and then we call the asynchronous `greeting` procedure to get the result.

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();
const router = t.router({
  // Create procedure at path 'greeting'
  greeting: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => `Hello ${input.name}`),
});

const caller = router.createCaller({});
const result = await caller.greeting({ name: 'tRPC' });
```

### Mutation example

We create the router with a mutation and then we call the asynchronous `post` procedure to get the result.

```ts
import { z } from 'zod';
import { initTRPC } from '@trpc/server';

const posts = ['One', 'Two', 'Three'];

const t = initTRPC.create();
const router = t.router({
  post: t.router({
    delete: t.procedure.input(z.number()).mutation(({ input }) => {
      posts.splice(input, 1);
    }),
  }),
});

const caller = router.createCaller({});
await caller.post.delete(0);
```

### Context with middleware example

We create a middleware to check the context before execute `secret` procedure.
Below two examples, the former fails because the context doesn't fit the middleware logic the latter works correctly.

<br/>

:::info

- Middleware(s) are performed before any procedure(s).

:::

<br/>

```ts
import { TRPCError, initTRPC } from '@trpc/server';

const t = initTRPC.create();

const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.foo) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You are not authorized',
    });
  }

  return next();
});

const protectedProcedure = t.procedure.use(isAuthed);

const router = t.router({
  secret: protectedProcedure.query(({ ctx }) => ctx.foo),
});

// it returns an error because there isn't the right context param
const caller = router.createCaller({});
const result = await caller.secret();

// it works because foo property is present inside context param
const authorizedCaller = router.createCaller({ foo: 'bar' });
result = await authorizedCaller.secret();
```
