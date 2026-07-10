---
id: metadata
title: Route Metadata
sidebar_label: Route Metadata
slug: /metadata
---

Route metadata allows you to add an optional route specific `meta` property which will be available in all `middleware` function parameters.

## Create router with typed metadata

```jsx
import * as trpc from '@trpc/server';

// [...]

interface Meta {
  hasAuth: boolean
}

export const appRouter = trpc.router<Context, Meta>();
```

## Example with per route authentication settings

```tsx title='server.ts'
import * as trpc from '@trpc/server';

// [...]

interface Meta {
  hasAuth: boolean;
}

export const appRouter = trpc
  .router<Context, Meta>()
  .middleware(async ({ meta, next, ctx }) => {
    // only check authorization if enabled
    if (meta?.hasAuth && !ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }
    return next();
  })
  .query('hello', {
    meta: {
      hasAuth: false,
    },
    resolve({ ctx }) {
      return {
        greeting: `hello world`,
      };
    },
  })
  .query('protected-hello', {
    meta: {
      hasAuth: true,
    },
    resolve({ ctx }) {
      return {
        greeting: `hello world`,
      };
    },
  });
```
