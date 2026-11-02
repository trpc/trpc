---
id: routers
title: Define Routers
sidebar_label: Define Routers
slug: /server/routers
section: "Backend Usage"
order: 6
---

To begin building your tRPC-based API, you'll first need to define your router. Once you've mastered the fundamentals, you can [customize your routers](#advanced-usage) for more advanced use cases.

## Initialize tRPC

You should initialize tRPC **exactly once** per application. Multiple instances of tRPC will cause issues: for example, `t.mergeRouters()` throws if the routers come from different instances that each set a [transformer](/docs/server/data-transformers) or [error formatter](/docs/server/error-formatting). Create `t` in one file and import your procedures and `router` from it everywhere.

```ts twoslash title='server/trpc.ts'
// @filename: trpc.ts
// ---cut---
import { initTRPC } from '@trpc/server';

// You can use any variable name you like.
// We use t to keep things simple.
const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;
```

You'll notice we are exporting certain methods of the `t` variable here rather than `t` itself. This is to establish a certain set of procedures that we will use idiomatically in our codebase.

## Defining a router

Next, let's define a router with a procedure to use in our application. We have now created an API "endpoint".

In order for these endpoints to be exposed to the frontend, your [Adapter](/docs/server/adapters) should be configured with your `appRouter` instance.

```ts twoslash title="server/_app.ts"
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();

export const publicProcedure = t.procedure;
export const router = t.router;

// @filename: _app.ts
import * as trpc from '@trpc/server';
// ---cut---
import { publicProcedure, router } from './trpc';

const appRouter = router({
  greeting: publicProcedure.query(() => 'hello tRPC v11!'),
});

// Export only the type of a router!
// This prevents us from importing server code on the client.
export type AppRouter = typeof appRouter;
```

On the client, import it with `import type { AppRouter } from '...'` and never import the `appRouter` value: a type-only import is always erased, so your server code can't end up in the client bundle.

Procedures can't be named `then`, `call` or `apply`: `router()` throws if you use these names.

## Defining an inline sub-router {#inline-sub-router}

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
  // Using the router() method
  nested1: router({
    proc: publicProcedure.query(() => '...'),
  }),
  // Using an inline sub-router
  nested2: {
    proc: publicProcedure.query(() => '...'),
  },
});
```

## Advanced usage

When initializing your router, tRPC allows you to:

- Setup [request contexts](/docs/server/context)
- Assign [metadata](/docs/server/metadata) to procedures
- [Format](/docs/server/error-formatting) and [handle](/docs/server/error-handling) errors
- [Transform data](/docs/server/data-transformers) as needed
- Customize the [runtime configuration](#runtime-configuration)

You can use method chaining to customize your `t`-object on initialization. For example:

```ts twoslash
import { initTRPC } from '@trpc/server';

type Context = { userId: string };
type Meta = { description: string };

// ---cut---
const t = initTRPC.context<Context>().meta<Meta>().create({
  /* [...] */
});
```

### Runtime Configuration

```ts twoslash
type DataTransformerOptions = any;
type ErrorFormatter = any;
// ---cut---
interface RootConfig {
  /**
   * Use a data transformer
   * @see https://trpc.io/docs/v11/data-transformers
   */
  transformer: DataTransformerOptions;

  /**
   * Use custom error formatting
   * @see https://trpc.io/docs/v11/error-formatting
   */
  errorFormatter: ErrorFormatter;

  /**
   * Allow `@trpc/server` to run in non-server environments
   * @warning **Use with caution**, this should likely mainly be used within testing.
   * @default false
   */
  allowOutsideOfServer: boolean;

  /**
   * Is this a server environment?
   * @warning **Use with caution**, this should likely mainly be used within testing.
   * @default typeof window === 'undefined' || 'Deno' in window || process.env.NODE_ENV === 'test'
   */
  isServer: boolean;

  /**
   * Is this development?
   * Will be used to decide if the API should return stack traces
   * @default process.env.NODE_ENV !== 'production'
   */
  isDev: boolean;
}
```
