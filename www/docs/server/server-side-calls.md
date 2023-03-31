---
id: server-side-calls
title: Server Side Calls
sidebar_label: Server Side Calls
slug: /server/server-side-calls
---

You may need to call your procedure(s) directly from the same server they're hosted in, `router.createCaller()` can be used to achieve this.

:::info

`createCaller` should not be used to call procedures from within other procedures. This creates overhead by (potentially) creating context again, executing all middlewares, and validating the input - all of which were already done by the current procedure. Instead, you should extract the shared logic into a separate function and call that from within the procedures, like so:

<div className="flex gap-2 w-full justify-between pt-2">
  <img src="https://user-images.githubusercontent.com/51714798/212568342-0a8440cb-68ed-48ae-9849-8c7bc417633e.png" className="w-[49.5%]" />
  <img src="https://user-images.githubusercontent.com/51714798/212568254-06cc56d0-35f6-4bb5-bff9-d25caf092c2c.png" className="w-[49.5%]" />
</div>

:::

## Create caller

With the `router.createCaller({})` function (first argument is `Context`) we retrieve an instance of `RouterCaller`.

### Input query example

We create the router with an input query, and then we call the asynchronous `greeting` procedure to get the result.

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

We create the router with a mutation, and then we call the asynchronous `post` procedure to get the result.

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

We create a middleware to check the context before executing the `secret` procedure. Below are two examples: the former fails because the context doesn't fit the middleware logic, and the latter works correctly.

<br />

:::info

Middlewares are performed before any procedure(s) are called.

:::

<br />

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

### Example for a Next.js API endpoint

:::tip

This example shows how to use the caller in a Next.js API endpoint. tRPC creates API endpoints for you already, so this file is only meant to show
how to call a procedure from another, custom endpoint.

:::

```ts twoslash
// @noErrors
// ---cut---
import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { appRouter } from '~/server/routers/_app';

type ResponseData = {
  data?: {
    postTitle: string;
  };
  error?: {
    message: string;
  };
};

export default async (
  req: NextApiRequest,
  res: NextApiResponse<ResponseData>,
) => {
  /** We want to simulate an error, so we pick a post ID that does not exist in the database. */
  const postId = `this-id-does-not-exist-${Math.random()}`;

  const caller = appRouter.createCaller({});

  try {
    // the server-side call
    const postResult = await caller.post.byId({ id: postId });

    res.status(200).json({ data: { postTitle: postResult.title } });
  } catch (cause) {
    // If this a tRPC error, we can extract additional information.
    if (cause instanceof TRPCError) {
      // We can get the specific HTTP status code coming from tRPC (e.g. 404 for `NOT_FOUND`).
      const httpStatusCode = getHTTPStatusCodeFromError(cause);

      res.status(httpStatusCode).json({ error: { message: cause.message } });
      return;
    }

    // This is not a tRPC error, so we don't have specific information.
    res.status(500).json({
      error: { message: `Error while accessing post with ID ${postId}` },
    });
  }
};
```
