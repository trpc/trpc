---
id: middlewares
title: Middlewares
sidebar_label: Middlewares
slug: /middlewares
---

You are able to add middleware(s) to a procedure with the `t.procedure.use()` method. The middleware(s) will wrap the invocation of the procedure and must pass through its return value.

## Authorization

In the example below, any call to a `protectedProcedure` will ensure that the user is an "admin" before executing.

```ts
import { TRPCError, initTRPC } from '@trpc/server';

interface Context {
  user?: {
    id: string;
    isAdmin: boolean;
    // [..]
  };
}

export const t = initTRPC.context<Context>().create();

const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user?.isAdmin) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

const adminProcedure = t.procedure.use(isAdmin);

const adminRouter = t.router({
  secretPlace: adminProcedure.query(() => 'a key'),
});

export const appRouter = t.router({
  foo: t.procedure.query(() => 'bar'),
  admin: adminRouter,
});
```

:::tip
See [Error Handling](error-handling.md) to learn more about the `TRPCError` thrown in the above example.
:::

## Logging

In the example below timings for queries are logged automatically.

```ts
// trpc.ts
import { initTRPC } from '@trpc/server';

export const t = initTRPC.context<Context>().create();

export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const router = t.router;

export const loggerMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;
  result.ok
    ? logMock('OK request timing:', { path, type, durationMs })
    : logMock('Non-OK request timing', { path, type, durationMs });

  return result;
});

export const loggedProcedure = procedure.use(loggerMiddleware);

// _app.ts
import { router, loggedProcedure } from '../trpc';

export const appRouter = router({
  foo: loggedProcedure.query(() => 'bar'),
  abc: loggedProcedure.query(() => 'def'),
});
```

## Using Express-like middleware without Express

It is possible to use Express-like middleware with other adapters if it extends the `IncomingMessage` and `ServerResponse` classes for their request and response objects.

In this example, [Morgan](https://www.npmjs.com/package/morgan) is used to log the requests being sent to the server.

```ts
import morgan from "morgan";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";

// The adapter creates a context containing the request and response objects
export async function createContext(opts: CreateNextContextOptions) {
  return { req: opts.req, res: opts.res };
}

const t = initTRPC.context<inferAsyncReturnType<typeof createContext>>().create();

// Create a new logger with the "dev" preset
// More info: https://expressjs.com/en/resources/middleware/morgan.html
// logger is a function that accepts the req, res, and next function
const logger = morgan("dev");

export const loggingMiddleware = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    const result = await new Promise<ReturnType<typeof next>>((resolver) => {
      // logger calls the third parameter
      logger(ctx.req, ctx.res, () => {
        // Call the next function and resolve the promise with its returned value
        resolver(next());
      });
    });

    // The value of result is the return value of the next function
    return result;
  })
);

// Only uses the middleware if the server is running in a development environment
export const procedure = process.env.NODE_ENV !== "development" ? t.procedure : loggingMiddleware;
```

## Context Swapping

Context swapping in tRPC is a very powerful feature that allows you to create base procedures that can create base procedures that dynamically infers new context in a flexible and typesafe manner.

Below we have an example of a a middleware that changes properties of the context, and procedures will receive the new context value:

```ts twoslash
// @target: esnext
import { TRPCError, initTRPC } from '@trpc/server';

const t = initTRPC.context<Context>().create();
const publicProcedure = t.procedure;
const router = t.router;
const middleware = t.middleware;

// ---cut---

type Context = {
  // user is nullable
  user?: {
    id: string;
  };
};

const isAuthed = middleware(({ ctx, next }) => {
  // `ctx.user` is nullable
  if (!ctx.user) {
    //     ^?
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      // ✅ user value is known to be non-null now
      user: ctx.user,
      // ^?
    },
  });
});

const protectedProcedure = publicProcedure.use(isAuthed);

export const appRouter = router({
  userId: protectedProcedure.query(({ ctx }) => ctx.user.id),
  //                                                 ^?
});
```
