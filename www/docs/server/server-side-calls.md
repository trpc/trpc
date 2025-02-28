---
id: server-side-calls
title: Server Side Calls
sidebar_label: Server Side Calls
slug: /server/server-side-calls
---

You may need to call your procedure(s) directly from the same server they're hosted in, `createCallerFactory()` can be used to achieve this. This is useful for server-side calls and for integration testing of your tRPC procedures.

:::info

`createCaller` should not be used to call procedures from within other procedures. This creates overhead by (potentially) creating context again, executing all middlewares, and validating the input - all of which were already done by the current procedure. Instead, you should extract the shared logic into a separate function and call that from within the procedures, like so:

<div className="flex gap-2 w-full justify-between pt-2">
  <img src="https://assets.trpc.io/www/docs/server/server-side-calls/bad.png" className="w-[49.5%]" />
  <img src="https://assets.trpc.io/www/docs/server/server-side-calls/good.png" className="w-[49.5%]" />
</div>

:::

## Create caller

With the `t.createCallerFactory`-function you can create a server-side caller of any router. You first call `createCallerFactory` with an argument of the router you want to call, then this returns a function where you can pass in a `Context` for the following procedure calls.

### Basic example

We create the router with a query to list posts and a mutation to add posts, and then we a call each method.

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

type Context = {
  foo: string;
};

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const { createCallerFactory, router } = t;

interface Post {
  id: string;
  title: string;
}
const posts: Post[] = [
  {
    id: '1',
    title: 'Hello world',
  },
];
const appRouter = router({
  post: router({
    add: publicProcedure
      .input(
        z.object({
          title: z.string().min(2),
        }),
      )
      .mutation((opts) => {
        const post: Post = {
          ...opts.input,
          id: `${Math.random()}`,
        };
        posts.push(post);
        return post;
      }),
    list: publicProcedure.query(() => posts),
  }),
});

// 1. create a caller-function for your router
const createCaller = createCallerFactory(appRouter);

// 2. create a caller using your `Context`
const caller = createCaller({
  foo: 'bar',
});

// 3. use the caller to add and list posts
const addedPost = await caller.post.add({
  title: 'How to make server-side call in tRPC',
});

const postList = await caller.post.list();
//     ^?
```

### Example usage in an integration test

> Taken from [https://github.com/trpc/examples-next-prisma-starter/blob/main/src/server/routers/post.test.ts](https://github.com/trpc/examples-next-prisma-starter/blob/main/src/server/routers/post.test.ts)

```ts
import { inferProcedureInput } from '@trpc/server';
import { createContextInner } from '../context';
import { AppRouter, createCaller } from './_app';

test('add and get post', async () => {
  const ctx = await createContextInner({});
  const caller = createCaller(ctx);

  const input: inferProcedureInput<AppRouter['post']['add']> = {
    text: 'hello test',
    title: 'hello test',
  };

  const post = await caller.post.add(input);
  const byId = await caller.post.byId({ id: post.id });

  expect(byId).toMatchObject(input);
});
```

## `router.createCaller()`

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
    .query((opts) => `Hello ${opts.input.name}`),
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
    add: t.procedure.input(z.string()).mutation((opts) => {
      posts.push(opts.input);
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
import { initTRPC, TRPCError } from '@trpc/server';

type Context = {
  user?: {
    id: string;
  };
};
const t = initTRPC.context<Context>().create();

const protectedProcedure = t.procedure.use((opts) => {
  const { ctx } = opts;
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You are not authorized',
    });
  }

  return opts.next({
    ctx: {
      // Infers that the `user` is non-nullable
      user: ctx.user,
    },
  });
});

const router = t.router({
  secret: protectedProcedure.query((opts) => opts.ctx.user),
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
import { appRouter } from '~/server/routers/_app';
import type { NextApiRequest, NextApiResponse } from 'next';

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

### Error handling

The `createFactoryCaller` and the `createCaller` function can take an error handler through the `onError` option. This can be used to throw errors that are not wrapped in a TRPCError, or respond to errors in some other way. Any handler passed to createCallerFactory will be called before the handler passed to createCaller.
The handler is called with the same arguments as an error formatter would be, except for the shape field:

```ts
{
  ctx: unknown; // The request context
  error: TRPCError; // The TRPCError that was thrown
  path: string | undefined; // The path of the procedure that threw the error
  input: unknown; // The input that was passed to the procedure
  type: 'query' | 'mutation' | 'subscription' | 'unknown'; // The type of the procedure that threw the error
}
```

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC
  .context<{
    foo?: 'bar';
  }>()
  .create();

const router = t.router({
  greeting: t.procedure.input(z.object({ name: z.string() })).query((opts) => {
    if (opts.input.name === 'invalid') {
      throw new Error('Invalid name');
    }

    return `Hello ${opts.input.name}`;
  }),
});

const caller = router.createCaller(
  {
    /* context */
  },
  {
    onError: (opts) => {
      console.error('An error occurred:', opts.error);
    },
  },
);

// The following will log "An error occurred: Error: Invalid name", and then throw a plain error
//  with the message "This is a custom error"
await caller.greeting({ name: 'invalid' });
```
