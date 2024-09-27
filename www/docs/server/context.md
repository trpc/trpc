---
id: context
title: Context
sidebar_label: Context
slug: /server/context
---

Your context holds data that all of your tRPC procedures will have access to, and is a great place to put things like database connections or authentication information.

Setting up the context is done in 2 steps, defining the type during initialization and then creating the runtime context for each request.

## Defining the context type

When initializing tRPC using `initTRPC`, you should pipe `.context<TContext>()` to the `initTRPC` builder function before calling `.create()`. The type `TContext` can either be inferred from a function's return type or be explicitly defined.

This will make sure your context is properly typed in your procedures and middlewares.

```ts twoslash
import * as trpc from '@trpc/server';
// ---cut---
import { initTRPC } from '@trpc/server';
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getSession } from 'next-auth/react';

export const createContext = async (opts: CreateNextContextOptions) => {
  const session = await getSession({ req: opts.req });

  return {
    session,
  };
};

const t1 = initTRPC.context<typeof createContext>().create();
// @noErrors
t1.procedure.use(({ ctx }) => { ... });
//                  ^?

type Context = Awaited<ReturnType<typeof createContext>>;
const t2 = initTRPC.context<Context>().create();
// @noErrors
t2.procedure.use(({ ctx }) => { ... });
//                  ^?
```

## Creating the context

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

## Inner and outer context

In some scenarios it could make sense to split up your context into "inner" and "outer" functions.

**Inner context** is where you define context which doesn’t depend on the request, e.g. your database connection. You can use this function for integration testing or [server-side helpers](/docs/client/nextjs/server-side-helpers), where you don’t have a request object. Whatever is defined here will **always** be available in your procedures.

**Outer context** is where you define context which depends on the request, e.g. for the user's session. Whatever is defined here is only available for procedures that are called via HTTP.

### Example for inner & outer context

```ts
import type { CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getSessionFromCookie, type Session } from './auth';

/**
 * Defines your inner context shape.
 * Add fields here that the inner context brings.
 */
interface CreateInnerContextOptions extends Partial<CreateNextContextOptions> {
  session: Session | null;
}

/**
 * Inner context. Will always be available in your procedures, in contrast to the outer context.
 *
 * Also useful for:
 * - testing, so you don't have to mock Next.js' `req`/`res`
 * - tRPC's `createServerSideHelpers` where we don't have `req`/`res`
 *
 * @see https://trpc.io/docs/v11/context#inner-and-outer-context
 */
export async function createContextInner(opts?: CreateInnerContextOptions) {
  return {
    prisma,
    session: opts.session,
  };
}

/**
 * Outer context. Used in the routers and will e.g. bring `req` & `res` to the context as "not `undefined`".
 *
 * @see https://trpc.io/docs/v11/context#inner-and-outer-context
 */
export async function createContext(opts: CreateNextContextOptions) {
  const session = getSessionFromCookie(opts.req);

  const contextInner = await createContextInner({ session });

  return {
    ...contextInner,
    req: opts.req,
    res: opts.res,
  };
}

export type Context = Awaited<ReturnType<typeof createContextInner>>;

// The usage in your router is the same as the example above.
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
