---
id: router
title: Define Routers
sidebar_label: Define Routers
slug: /router
---

## Initialize tRPC


- If you don't like the variable name `t`, you can call it whatever you want
- You should create your root `t`-variable **exactly once** per application
- You can also create the `t`-variable with a [context](context), [metadata](metadata), a [error formatter](error-formatting), or a [data transformer](data-transformers).


```ts twoslash title='server/trpc.ts'
// @filename: trpc.ts
// ---cut---
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();
```

## Defining a router

```ts twoslash title="server/_app.ts"
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
export const t = initTRPC.create();

// @filename: _app.ts
// ---cut---
import * as trpc from '@trpc/server';
import { t } from './trpc';

const appRouter = t.router({
  greeting: t.procedure.query(() => 'hello tRPC v10!'),
});

// Export only the **type** of a router to avoid importing server code on the client
export type AppRouter = typeof appRouter;
```

## `initTRPC` options

Use chaining to setup your `t`-object, example:

```ts
initTRPC()
  .context<Context>()
  .meta<Meta>()
  .create({ /* [...] */})
```
### `.context<Context>()`

Setup a [request context](context).

### `.meta<Meta>()`

Setup [metadata](metadata) for your procedures.


### `.create(opts: Partial<RuntimeConfig>)`


`RuntimeConfig` reference:

```ts

export interface RuntimeConfig<TTypes extends RootConfigTypes> {
  /**
   * Use a data transformer
   * @link https://trpc.io/docs/data-transformers
   */
  transformer: TTypes['transformer'];
  /**
   * Use custom error formatting
   * @link https://trpc.io/docs/error-formatting
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