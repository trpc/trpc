---
id: metadata
title: Metadata
sidebar_label: Metadata
slug: /server/metadata
---

Procedure metadata allows you to add an optional procedure specific `meta` property which will be available in all [middleware](middlewares) function parameters.

:::tip
Use metadata together with [`trpc-openapi`](https://github.com/jlalmes/trpc-openapi) if you want to expose REST-compatible endpoints for your application.
:::

## Create router with typed metadata

```tsx
import { initTRPC } from '@trpc/server';

// [...]

interface Meta {
  authRequired: boolean;
}

export const t = initTRPC.context<Context>().meta<Meta>().create();

export const appRouter = t.router({
  // [...]
});
```

## Example with per route authentication settings

```tsx title='server.ts'
import { initTRPC } from '@trpc/server';

// [...]

interface Meta {
  authRequired: boolean;
}

export const t = initTRPC.context<Context>().meta<Meta>().create();

export const authedProcedure = t.procedure.use(async (opts) => {
  const { meta, next, ctx } = opts;
  // only check authorization if enabled
  if (meta?.authRequired && !ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next();
});

export const appRouter = t.router({
  hello: authedProcedure.meta({ authRequired: false }).query(() => {
    return {
      greeting: 'hello world',
    };
  }),
  protectedHello: authedProcedure.meta({ authRequired: true }).query(() => {
    return {
      greeting: 'hello-world',
    };
  }),
});
```

## Default meta, chaining, and shallow merging

You can set default values for your meta type, and if you chain meta on top of a base procedure it will be shallow merged.

```tsx
import { initTRPC } from '@trpc/server';

interface Meta {
  authRequired: boolean;
  role?: 'user' | 'admin'
}

export const t = initTRPC
  .context<Context>()
  .meta<Meta>()
  .create({
    // Set a default value
    defaultMeta: { authRequired: false }
  });

const publicProcedure = t.procedure
// ^ Default Meta: { authRequired: false }

const authProcedure = publicProcedure
  .use(authMiddleware)
  .meta({
    authRequired: true;
    role: 'user'
  });
// ^ Meta: { authRequired: true, role: 'user' }

const adminProcedure = authProcedure
  .meta({
    role: 'admin'
  });
// ^ Meta: { authRequired: true, role: 'admin' }
```
