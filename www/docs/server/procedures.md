---
id: procedures
title: Define Procedures
sidebar_label: Define Procedures
slug: /procedures
---


:::tip

- A procedure can be viewed as the equivalent of a REST-endpoint or a function.
- There's no internal difference between queries and mutations apart from semantics.
- Defining procedure is the same for queries, mutations, and subscription with the exception that subscriptions need to return an `observable` instance.

:::



## Example without input validation

```ts twoslash
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
export const t = initTRPC.create();

// @filename: _app.ts
// @noErrors
// ---cut---
import { t } from './trpc';
import { z } from 'zod';

const appRouter = t.router({
  // Create procedure at path 'hello'
  hello: t.procedure.query(() => {
    return {
      greeting: 'hello world',
    };
  }),
});

```

## Input validation

tRPC works out-of-the-box with yup/superstruct/zod/myzod/custom validators/[..] - [see test suite](https://github.com/trpc/trpc/blob/main/packages/server/test/validators.test.ts)


### With [Zod](https://github.com/colinhacks/zod)

```ts twoslash

// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
export const t = initTRPC.create();

// @filename: _app.ts
// ---cut---
import { t } from './trpc';
import { z } from 'zod';

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

### With [Yup](https://github.com/jquense/yup)

```tsx
import { initTRPC } from '@trpc/server';
import * as yup from 'yup';

export const t = initTRPC.create();

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

export const t = initTRPC.create();

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


## Multiple input parsers

You're able to chain multiple parsers in order to make reusable procedures for different parts of your application.


```ts twoslash title='server.ts'
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
export const t = initTRPC.create();

// @filename: _app.ts
// ---cut---
import { t } from './trpc';
import { z } from 'zod';

// Create reusable procedure for a chat room
const roomProcedure = t.procedure.input(
  z.object({
    roomId: z.string(),
  }),
);

const appRouter = t.router({
  sendMessage: roomProcedure
    // Add extra input validation for the `sendMessage`-procedure
    .input(
      z.object({
        text: z.string(),
      }),
    )
    .mutation(({ input }) => {
      //         ^?
      // [...]
    }),
});

export type AppRouter = typeof appRouter;
```

## Multiple Procedures

To add multiple procedures, you define them as properties on the object passed to `t.router()`.

```tsx
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

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
