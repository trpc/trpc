---
id: procedures
title: Defining Procedures
sidebar_label: Defining Procedures (endponts/routes)
slug: /procedures
---

:::info

- A procedure can be viewed as the equivalent of a REST-endpoint.
- There's no internal difference between queries and mutations apart from semantics.
- Defining procedures is the same for queries, mutations, and subscription with the exception that subscriptions need to return a `Subscription`-instance.

:::




## Example query without input argument

```tsx
import * as trpc from '@trpc/server';

export const appRouter = trpc.router()
  // Create procedure at path 'hello'
  .query('hello', {
    resolve({ ctx }) {
      return {
        greeting: `hello world`,
      };
    },
  });

export type AppRouter = typeof appRouter;
```

## Example query with input argument

```tsx
import * as trpc from '@trpc/server';
import * as z from 'zod';

export const appRouter = trpc.router()
  .query('hello', {
    input: z
      .object({
        text: z.string().optional(),
      })
      .optional(),
    resolve({ input }) {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    },
  });

export type AppRouter = typeof appRouter;
```

## To add multiple endpoints, you must chain the calls

```tsx
import * as trpc from '@trpc/server';

export const appRouter = trpc.router()
  .query('hello', {
    resolve({ ctx }) {
      return {
        text: `hello world`,
      };
    },
  })
  .query('bye', {
    resolve({ ctx }) {
      return {
        text: `goodbye`,
      };
    },
  });

export type AppRouter = typeof appRouter;
```

