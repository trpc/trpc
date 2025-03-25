---
id: context
title: Context
sidebar_label: Context
slug: /server/context
---

Your context holds data that all of your tRPC procedures will have access to, and is a great place to put things like authentication information.

Setting up the context is done in 2 steps:

1. Defining the type during initialization (this changes slightly depending on [which adapter](/docs/server/adapters-intro.md) you are using)
2. Creating the runtime context for each request

:::info
The examples below are using the [Standalone Adapter](./adapters/standalone.md).

Depending on [your adapter](./adapters-intro.md), you need to use a different first argument for the `createContext` function.
:::

## Defining the context type

When initializing tRPC using `initTRPC`, you should pipe `.context<TContext>()` to the `initTRPC` builder function before calling `.create()`. The type `TContext` can either be inferred from a function's return type or be explicitly defined.

This will make sure your context is properly typed in your procedures and middlewares.

<!-- prettier-ignore-start -->

```ts twoslash title='server/context.ts'
// @filename: /server/somewhere/in/your/app/utils.ts
interface Session {}
export declare function getSession(request: Request): Session | null
// @filename: server/context.ts
// ---cut---
import {
  getSession // Example function
} from './somewhere/in/your/app/utils';
import { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

export async function createContext(opts: CreateHTTPContextOptions) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  const session = await getSession(opts.req);


  return {
    ...opts,
    session,
    // ^?
  };
}

// This context will be available as `ctx` in all your resolvers
export type Context = Awaited<ReturnType<typeof createContext>>;
//           ^?

```

## Using the context in the root `initTRPC`-object

```ts twoslash title="server/trpc.ts"
// @filename: server/context.ts
import { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';
interface Session {}
export type Context =  {
  session: Session
} & CreateHTTPContextOptions
// @filename: server/trpc.ts
// ---cut---
import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';

const t = initTRPC.context<Context>().create();

export const publicProcedure = t.procedure;
export const router = t.router;


export const protectedProcedure = publicProcedure.use(async (opts) => {
  const { session } = opts.ctx;
    //     ^?
    if (!session) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return opts.next({
      ctx: {
        session,
      }
    })
})
```
<!-- prettier-ignore-end -->

## Creating the context in your adapter or a server-side call

The `createContext()` function must be passed to the handler that is mounting your appRouter, which may be via HTTP, a [server-side call](server-side-calls) or our [server-side helpers](/docs/client/nextjs/server-side-helpers).

`createContext()` is called for each invocation of tRPC, so batched requests will share a context.

```ts
// 1. HTTP request
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { createContext } from './context';
import { appRouter } from './router';

const handler = createHTTPHandler({
  router: appRouter,
  createContext,
});
```

```ts
// 2. Server-side call
import { createContext } from './context';
import { createCaller } from './router';

const caller = createCaller(await createContext());
```

```ts
// 3. servers-side helpers
import { createServerSideHelpers } from '@trpc/react-query/server';
import { createContext } from './context';
import { appRouter } from './router';

const helpers = createServerSideHelpers({
  router: appRouter,
  ctx: await createContext(),
});
```

## Example code

<!-- prettier-ignore-start -->

```tsx twoslash
// -------------------------------------------------
// @filename: context.ts
// -------------------------------------------------
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getSession } from 'next-auth/react';

/**
 * Creates context for an incoming request
 * @see https://trpc.io/docs/v11/context
 */
export async function createContext(opts: CreateNextContextOptions) {
  const session = await getSession({ req: opts.req });

  return {
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

// -------------------------------------------------
// @filename: trpc.ts
// -------------------------------------------------
import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';

const t = initTRPC.context<Context>().create();


export const router = t.router;

/**
 * Unprotected procedure
 */
export const publicProcedure = t.procedure;

/**
 * Protected procedure
 */
export const protectedProcedure = t.procedure.use(function isAuthed(opts) {
  if (!opts.ctx.session?.user?.email) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
    });
  }
  return opts.next({
    ctx: {
      // Infers the `session` as non-nullable
      session: opts.ctx.session,
    },
  });
});
```

<!-- prettier-ignore-end -->

## Inner and outer context {#inner-and-outer-context}

In MOST scenarios it could make sense to split up your context into "inner" and "outer" functions.

**Inner context** is where you define context which doesn’t depend on the request, e.g. your the resolved `User` for a request. You can use this function for integration testing or [server-side helpers](/docs/client/nextjs/server-side-helpers), where you don’t have a request object. Whatever is defined here will **always** be available in your procedures.

**Outer context** is where you define context which depends on the request, e.g. for the user's session. Whatever is defined here is only available for procedures that are called via HTTP.

### Example for inner & outer context

```ts
import type { CreateHTTPContextOptions } from '@trpc/server/adapters/standalone';

/**
 * Defines your inner context shape.
 * Add fields here that the inner context brings.
 */
interface CreateInnerContextOptions extends Partial<CreateHTTPContextOptions> {
  session: Session | null;
}

/*
 * Defines your inner context shape
 * Add fields here that the inner context brings.
 * @see https://trpc.io/docs/server/context#inner-and-outer-context
 */
export async function createContextInner(opts: CreateInnerContextOptions) {
  return {
    ...opts,
    session,
  };
}

// This context will be available as `ctx` in all your resolvers
export type Context = Awaited<ReturnType<typeof createContextInner>>;

export async function createContext(
  /**
   * Depending on your adapter, the first argument of this function will be different.
   * @see https://trpc.io/docs/server/context
   */
  opts: CreateHTTPContextOptions,
) {
  // Create your context based on the request object
  // Will be available as `ctx` in all your resolvers

  const session = await getSession(opts.req);

  const ctx = await createContextInner({
    ...opts,
    session,
  });

  return ctx;
}
```

It is important to infer your `Context` from the **inner** context, as only what is defined there is really always available in your procedures.

If you don't want to check `req` or `res` for `undefined` in your procedures all the time, you could build a small reusable procedure for that:

```ts
export const apiProcedure = publicProcedure.use((opts) => {
  if (!opts.ctx.req || !opts.ctx.res) {
    throw new Error('You are missing `req` or `res` in your call.');
  }
  return opts.next({
    ctx: {
      // We overwrite the context with the truthy `req` & `res`, which will also overwrite the types used in your procedure.
      req: opts.ctx.req,
      res: opts.ctx.res,
    },
  });
});
```
