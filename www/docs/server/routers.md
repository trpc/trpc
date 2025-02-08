---
id: routers
title: Define Routers
sidebar_label: Define Routers
slug: /server/routers
---

To begin building your tRPC-based API, you'll first need to define your router. Once you've mastered the fundamentals, you can [customize your routers](#advanced-usage) for more advanced use cases.

## Initialize tRPC

You should initialize tRPC **exactly once** per application. Multiple instances of tRPC will cause issues.

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
  greeting: publicProcedure.query(() => 'hello tRPC v10!'),
});

// Export only the type of a router!
// This prevents us from importing server code on the client.
export type AppRouter = typeof appRouter;
```

## Advanced usage

When initializing your router, tRPC allows you to:

- Setup [request contexts](/docs/server/context)
- Assign [metadata](/docs/server/metadata) to procedures
- [Format](/docs/server/error-formatting) and [handle](/docs/server/error-handling) errors
- [Transform data](/docs/server/data-transformers) as needed
- Customize the [runtime configuration](#runtime-configuration)
- Lazy load routers

You can use method chaining to customize your `t`-object on initialization. For example:

```ts
const t = initTRPC.context<Context>().meta<Meta>().create({
  /* [...] */
});
```

### Lazy load routers {#lazy-load}

When using lazy loading, you can use the `experimental_lazy` function to lazy load your routers.

This can be useful to decrease cold starts of your application.

```ts twoslash
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: routers/user.ts
import { router } from '../trpc';
export const userRouter = router({
  hello: publicProcedure.query(() => 'world'),
});

// @filename: routers/_app.ts
import { experimental_lazy } from '@trpc/server';
import { router } from '../trpc';

const user = experimental_lazy(() =>
  import('./user.js').then((m) => {
    console.log('💤 lazy loaded user router');
    return m.userRouter;
  }),
);

export const appRouter = router({
  user,
});

```

### Runtime Configuration

```ts
export interface RootConfig<TTypes extends RootTypes> {
  /**
   * Use a data transformer
   * @see https://trpc.io/docs/v11/data-transformers
   */
  transformer: TTypes['transformer'];

  /**
   * Use custom error formatting
   * @see https://trpc.io/docs/v11/error-formatting
   */
  errorFormatter: ErrorFormatter<TTypes['ctx'], any>;

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
