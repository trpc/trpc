---
id: middlewares
title: Middlewares
sidebar_label: Middlewares
slug: /server/middlewares
---

You are able to add middleware(s) to a procedure with the `t.procedure.use()` method. The middleware(s) will wrap the invocation of the procedure and must pass through its return value.

## Authorization

In the example below, any call to a `adminProcedure` will ensure that the user is an "admin" before executing.

```twoslash include admin
import { TRPCError, initTRPC } from '@trpc/server';

interface Context {
  user?: {
    id: string;
    isAdmin: boolean;
    // [..]
  };
}

const t = initTRPC.context<Context>().create();
export const publicProcedure = t.procedure;
export const router = t.router;

export const adminProcedure = publicProcedure.use(async (opts) => {
  const { ctx } = opts;
  if (!ctx.user?.isAdmin) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return opts.next({
    ctx: {
      user: ctx.user,
    },
  });
});
```

```ts twoslash
// @include: admin
```

```ts twoslash
// @filename: trpc.ts
// @include: admin
// @filename: _app.ts
// ---cut---
import { adminProcedure, publicProcedure, router } from './trpc';

const adminRouter = router({
  secretPlace: adminProcedure.query(() => 'a key'),
});

export const appRouter = router({
  foo: publicProcedure.query(() => 'bar'),
  admin: adminRouter,
});
```

:::tip
See [Error Handling](error-handling.md) to learn more about the `TRPCError` thrown in the above example.
:::

## Logging

In the example below timings for queries are logged automatically.

```twoslash include trpclogger
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();


export const publicProcedure = t.procedure;
export const router = t.router;

declare function logMock(...args: any[]): void;
// ---cut---

export const loggedProcedure = publicProcedure.use(async (opts) => {
  const start = Date.now();

  const result = await opts.next();

  const durationMs = Date.now() - start;
  const meta = { path: opts.path, type: opts.type, durationMs };

  result.ok
    ? console.log('OK request timing:', meta)
    : console.error('Non-OK request timing', meta);

  return result;
});
```

```ts twoslash
// @include: trpclogger
```

```ts twoslash
// @filename: trpc.ts
// @include: trpclogger
// @filename: _app.ts
// ---cut---
import { loggedProcedure, router } from './trpc';

export const appRouter = router({
  foo: loggedProcedure.query(() => 'bar'),
  abc: loggedProcedure.query(() => 'def'),
});
```

## Context Extension

"Context Extension" enables middlewares to dynamically add and override keys on a base procedure's context in a typesafe manner.

Below we have an example of a middleware that changes properties of a context, the changes are then available to all chained consumers, such as other middlewares and procedures:

```ts twoslash
// @target: esnext
import { initTRPC, TRPCError } from '@trpc/server';

const t = initTRPC.context<Context>().create();
const publicProcedure = t.procedure;
const router = t.router;

// ---cut---

type Context = {
  // user is nullable
  user?: {
    id: string;
  };
};

const protectedProcedure = publicProcedure.use(async function isAuthed(opts) {
  const { ctx } = opts;
  // `ctx.user` is nullable
  if (!ctx.user) {
    //     ^?
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return opts.next({
    ctx: {
      // ✅ user value is known to be non-null now
      user: ctx.user,
      // ^?
    },
  });
});

protectedProcedure.query(({ ctx }) => ctx.user);
//                                        ^?
```

## Using `.concat()` to create reusable middlewares and plugins {#concat}

:::info
We have prefixed this as `unstable_` as it's a new API, but you're safe to use it! [Read more](/docs/faq#unstable).
:::

:::tip

- Creating middlewares using `t.middleware` has the limitation that the `Context` type is tied to the `Context` type of the tRPC instance.
- Creating middlewares with `experimental_standaloneMiddleware()` has the limitation that you cannot define input parsers and similar tied to your module.

:::

tRPC has an API called `.concat()` which allows you to independently define a partial procedure that can be used with any tRPC instance that matches the context and metadata of the plugin.

This helper primarily targets creating plugins and libraries with tRPC.

<!-- TODO: add docs with a real-world example of a plugin or something -->

```ts twoslash
// @target: esnext
// ------------------------------------------------
// 🧩🧩🧩 a library creating a reusable plugin 🧩🧩🧩
// @filename: myPlugin.ts

import { initTRPC, TRPCError } from '@trpc/server';

export function createMyPlugin() {
  // When creating a plugin for tRPC, you use the same API as creating any other tRPC-app
  // this is the plugin's root `t`-object
  const t = initTRPC
    .context<{
      // the procedure using the plugin will need to extend this context
    }>()
    .meta<{
      // the base `initTRPC`-object of the application using this needs to extend this meta
    }>()
    .create();

  return {
    // you can also add `.input()` if you want your plugin to do input validation
    pluginProc: t.procedure.use((opts) => {
      return opts.next({
        ctx: {
          fromPlugin: 'hello from myPlugin' as const,
        },
      });
    }),
  };
}
// ------------------------------------
// 🚀🚀🚀 the app using the plugin 🚀🚀🚀
// @filename: app.ts
import { createMyPlugin } from './myPlugin';
import { initTRPC, TRPCError } from '@trpc/server';


// the app's root `t`-object
const t = initTRPC
  .context<{
    // ...
  }>()
  .create();


export const publicProcedure = t.procedure;
export const router = t.router;

// initialize the plugin (a real-world example would likely take options here)
const plugin = createMyPlugin();

// create a base procedure using the plugin
const procedureWithPlugin = publicProcedure
  .unstable_concat(
    plugin.pluginProc,
  )
  .use(opts => {
    const { ctx } = opts;
    //      ^?
    return opts.next()
  })


export const appRouter = router({
  hello: procedureWithPlugin.query(opts => {
    return opts.ctx.fromPlugin;
  })
})
```

## Extending middlewares

:::info
We have prefixed this as `unstable_` as it's a new API, but you're safe to use it! [Read more](/docs/faq#unstable).
:::

We have a powerful feature called `.pipe()` which allows you to extend middlewares in a typesafe manner.

Below we have an example of a middleware that extends a base middleware(foo). Like the context extension example above, piping middlewares will change properties of the context, and procedures will receive the new context value.

```ts twoslash
// @target: esnext
import { initTRPC, TRPCError } from '@trpc/server';

const t = initTRPC.create();
const publicProcedure = t.procedure;
const router = t.router;
const middleware = t.middleware;

// ---cut---

const fooMiddleware = t.middleware((opts) => {
  return opts.next({
    ctx: {
      foo: 'foo' as const,
    },
  });
});

const barMiddleware = fooMiddleware.unstable_pipe((opts) => {
  const { ctx } = opts;
  ctx.foo;
  //   ^?
  return opts.next({
    ctx: {
      bar: 'bar' as const,
    },
  });
});

const barProcedure = publicProcedure.use(barMiddleware);
barProcedure.query(({ ctx }) => ctx.bar);
//                              ^?
```

Beware that the order in which you pipe your middlewares matter and that the context must overlap. An example of a forbidden pipe is shown below. Here, the `fooMiddleware` overrides the `ctx.a` while `barMiddleware` still expects the root context from the initialization in `initTRPC` - so piping `fooMiddleware` with `barMiddleware` would not work, while piping `barMiddleware` with `fooMiddleware` does work.

```ts twoslash
import { initTRPC } from '@trpc/server';

const t = initTRPC
  .context<{
    a: {
      b: 'a';
    };
  }>()
  .create();

const fooMiddleware = t.middleware((opts) => {
  const { ctx } = opts;
  ctx.a; // 👈 fooMiddleware expects `ctx.a` to be an object
  //  ^?
  return opts.next({
    ctx: {
      a: 'a' as const, // 👈 `ctx.a` is no longer an object
    },
  });
});

const barMiddleware = t.middleware((opts) => {
  const { ctx } = opts;
  ctx.a; // 👈 barMiddleware expects `ctx.a` to be an object
  //  ^?
  return opts.next({
    ctx: {
      foo: 'foo' as const,
    },
  });
});

// @errors: 2345
// ❌ `ctx.a` does not overlap from `fooMiddleware` to `barMiddleware`
fooMiddleware.unstable_pipe(barMiddleware);

// ✅ `ctx.a` overlaps from `barMiddleware` and `fooMiddleware`
barMiddleware.unstable_pipe(fooMiddleware);
```

## Experimental: standalone middlewares

:::info
This has been deprecated in favor of `.unstable_concat()`
:::

tRPC has an experimental API called `experimental_standaloneMiddleware` which allows you to independently define a middleware that can be used with any tRPC instance. Creating middlewares using `t.middleware` has the limitation that
the `Context` type is tied to the `Context` type of the tRPC instance. This means that you cannot use the same middleware with multiple tRPC instances that have different `Context` types.

Using `experimental_standaloneMiddleware` you can create a middleware that explicitly defines its requirements, i.e. the Context, Input and Meta types:

```ts twoslash
// @target: esnext
import {
  experimental_standaloneMiddleware,
  initTRPC,
  TRPCError,
} from '@trpc/server';
import * as z from 'zod';

const projectAccessMiddleware = experimental_standaloneMiddleware<{
  ctx: { allowedProjects: string[] }; // defaults to 'object' if not defined
  input: { projectId: string }; // defaults to 'unknown' if not defined
  // 'meta', not defined here, defaults to 'object | undefined'
}>().create((opts) => {
  if (!opts.ctx.allowedProjects.includes(opts.input.projectId)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Not allowed',
    });
  }

  return opts.next();
});

const t1 = initTRPC
  .context<{
    allowedProjects: string[];
  }>()
  .create();

// ✅ `ctx.allowedProjects` satisfies "string[]" and `input.projectId` satisfies "string"
const accessControlledProcedure = t1.procedure
  .input(z.object({ projectId: z.string() }))
  .use(projectAccessMiddleware);

// @errors: 2345
// ❌ `ctx.allowedProjects` satisfies "string[]" but `input.projectId` does not satisfy "string"
const accessControlledProcedure2 = t1.procedure
  .input(z.object({ projectId: z.number() }))
  .use(projectAccessMiddleware);

// @errors: 2345
// ❌ `ctx.allowedProjects` does not satisfy "string[]" even though `input.projectId` satisfies "string"
const t2 = initTRPC
  .context<{
    allowedProjects: number[];
  }>()
  .create();

const accessControlledProcedure3 = t2.procedure
  .input(z.object({ projectId: z.string() }))
  .use(projectAccessMiddleware);
```

Here is an example with multiple standalone middlewares:

```ts twoslash
// @target: esnext
import { experimental_standaloneMiddleware, initTRPC } from '@trpc/server';
import * as z from 'zod';

const t = initTRPC.create();
const schemaA = z.object({ valueA: z.string() });
const schemaB = z.object({ valueB: z.string() });

const valueAUppercaserMiddleware = experimental_standaloneMiddleware<{
  input: z.infer<typeof schemaA>;
}>().create((opts) => {
  return opts.next({
    ctx: { valueAUppercase: opts.input.valueA.toUpperCase() },
  });
});

const valueBUppercaserMiddleware = experimental_standaloneMiddleware<{
  input: z.infer<typeof schemaB>;
}>().create((opts) => {
  return opts.next({
    ctx: { valueBUppercase: opts.input.valueB.toUpperCase() },
  });
});

const combinedInputThatSatisfiesBothMiddlewares = z.object({
  valueA: z.string(),
  valueB: z.string(),
  extraProp: z.string(),
});

t.procedure
  .input(combinedInputThatSatisfiesBothMiddlewares)
  .use(valueAUppercaserMiddleware)
  .use(valueBUppercaserMiddleware)
  .query(
    ({
      input: { valueA, valueB, extraProp },
      ctx: { valueAUppercase, valueBUppercase },
    }) =>
      `valueA: ${valueA}, valueB: ${valueB}, extraProp: ${extraProp}, valueAUppercase: ${valueAUppercase}, valueBUppercase: ${valueBUppercase}`,
  );
```
