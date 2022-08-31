---
id: metadata
title: Route Metadata
sidebar_label: Route Metadata
slug: /metadata
---

Procedure metadata allows you to add an optional procedure specific `meta` property which will be available in all [middleware](middlewares) function parameters.

## Create router with typed metadata

```tsx
import { trpc } from '@trpc/server';

// [...]

interface Meta {
  hasAuth: boolean;
}

export const t = trpc.context<Context>().meta<Meta>();

export const appRouter = t.router({
  // [...]
});
```

## Example with per route authentication settings

```tsx title='server.ts'
import { trpc } from '@trpc/server';

// [...]

interface Meta {
  hasAuth: boolean;
}

export const t = trpc.context<Context>().meta<Meta>();

const isAuthed = t.middleware(async ({ meta, next, ctx }) => {
  // only check authorization if enabled
  if (meta?.hasAuth && !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next();
});

export const authedProcedure = t.procedure.use(isAuthed);

export const appRouter = t.router({
  hello: authedProcedure.meta({ hasAuth: false }).query(() => {
    return {
      greeting: 'hello world',
    };
  }),
  protectedHello: authedProcedure.meta({ hasAuth: true }).query(() => {
    return {
      greeting: 'hello-world',
    };
  }),
});
```
