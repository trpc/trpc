---
id: router
title: Define Router & Procedures
sidebar_label: Define Router & Procedures
slug: /router
---

:::info

- A procedure can be viewed as the equivalent of a REST-endpoint.
- There's no internal difference between queries and mutations apart from semantics.
- Defining router is the same for queries, mutations, and subscription with the exception that subscriptions need to return an `observable` instance.

:::

## Input validation

tRPC works out-of-the-box with yup/superstruct/zod/myzod/custom validators/[..] - [see test suite](https://github.com/trpc/trpc/blob/main/packages/server/test/validators.test.ts)

### Example without input

```tsx
import { initTRPC } from '@trpc/server';

export const t = initTRPC()();

export const appRouter = t.router({
  // Create procedure at path 'hello'
  hello: t.query(() => {
    return {
      greeting: 'hello world',
    };
  }),
});
```

### With [Zod](https://github.com/colinhacks/zod)

```ts twoslash
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC()();

export const appRouter = t.router({
  hello: t.procedure
    .input(
      z
        .object({
          text: z.string(),
        })
        .optional(),
    )
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### Multiple input parsers

> You're able to chain multiple parsers


```ts twoslash title='server.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC()();

const roomProcedure = t.procedure.input(
  z.object({
    roomId: z.string(),
  }),
);

const appRouter = t.router({
  sendMessage: roomProcedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //         ^?
      return input;
    }),
});

export type AppRouter = typeof appRouter;
```
### With [Yup](https://github.com/jquense/yup)

```tsx
import { initTRPC } from '@trpc/server';
import * as yup from 'yup';

export const t = initTRPC()();

export const appRouter = t.router({
  hello: t.procedure
    .input(
      yup.object({
        text: yup.string().required(),
      }),
    )
    .query(({ input }) => {
      return {
        greeting: `hello ${input?.text ?? 'world'}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [Superstruct](https://github.com/ianstormtaylor/superstruct)

```tsx
import { initTRPC } from '@trpc/server';
import { defaulted, object, string } from 'superstruct';

export const t = initTRPC()();

export const appRouter = t.router({
  hello: t.procedure
    .input(
      object({
        /**
         * Also supports inline doc strings when referencing the type.
         */
        text: defaulted(string(), 'world'),
      }),
    )
    .query(({ input }) => {
      return {
        greeting: `hello ${input.text}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

## Multiple Procedures

To add multiple procedures, you can define them as properties on the object passed to `t.router()`.

```tsx
import { initTRPC } from '@trpc/server';

export const t = initTRPC()();

export const appRouter = t.router({
  hello: t.procedure.query(() => {
    return {
      text: 'hello world',
    };
  }),
  bye: t.procedure.query(() => {
    return {
      text: 'goodbye',
    };
  }),
});

export type AppRouter = typeof appRouter;
```
