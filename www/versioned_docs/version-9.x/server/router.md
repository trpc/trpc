---
id: router
title: Define Router
sidebar_label: Define Router
slug: /router
---

:::info

- A procedure can be viewed as the equivalent of a REST-endpoint.
- There's no internal difference between queries and mutations apart from semantics.
- Defining router is the same for queries, mutations, and subscription with the exception that subscriptions need to return a `Subscription`-instance.

:::

## Input validation

tRPC works out-of-the-box with yup/superstruct/zod/myzod/custom validators/[..] - [see test suite](https://github.com/trpc/trpc/blob/main/packages/server/test/validators.test.ts)

### Example without input

```tsx
import * as trpc from '@trpc/server';

// [...]

export const appRouter = trpc
  .router<Context>()
  // Create procedure at path 'hello'
  .query('hello', {
    resolve({ ctx }) {
      return {
        greeting: `hello world`,
      };
    },
  });
```

### With [Zod](https://github.com/colinhacks/zod)

```tsx
import * as trpc from '@trpc/server';
import { z } from 'zod';

// [...]

export const appRouter = trpc.router<Context>().query('hello', {
  input: z
    .object({
      text: z.string().nullish(),
    })
    .nullish(),
  resolve({ input }) {
    return {
      greeting: `hello ${input?.text ?? 'world'}`,
    };
  },
});

export type AppRouter = typeof appRouter;
```

### With [Yup](https://github.com/jquense/yup)

```tsx
import * as trpc from '@trpc/server';
import * as yup from 'yup';

// [...]

export const appRouter = trpc.router<Context>().query('hello', {
  input: yup.object({
    text: yup.string().required(),
  }),
  resolve({ input }) {
    return {
      greeting: `hello ${input?.text ?? 'world'}`,
    };
  },
});

export type AppRouter = typeof appRouter;
```

### With [Superstruct](https://github.com/ianstormtaylor/superstruct)

```tsx
import * as trpc from '@trpc/server';
import * as t from 'superstruct';

// [...]

export const appRouter = trpc.router<Context>().query('hello', {
  input: t.object({
    /**
     * Also supports inline doc strings when referencing the type.
     */
    text: t.defaulted(t.string(), 'world'),
  }),
  resolve({ input }) {
    return {
      greeting: `hello ${input.text}`,
    };
  },
});

export type AppRouter = typeof appRouter;
```

## Method chaining

To add multiple endpoints, you must chain the calls

```tsx
import * as trpc from '@trpc/server';

// [...]

export const appRouter = trpc
  .router<Context>()
  .query('hello', {
    resolve() {
      return {
        text: `hello world`,
      };
    },
  })
  .query('bye', {
    resolve() {
      return {
        text: `goodbye`,
      };
    },
  });

export type AppRouter = typeof appRouter;
```
