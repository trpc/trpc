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
