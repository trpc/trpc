---
id: procedures
title: Define Procedures
sidebar_label: Define Procedures
slug: /server/procedures
---

Procedures in tRPC are very flexible primitives to create backend functions; they use a builder pattern which means you can create reusable base procedures for different parts of your backend application.

:::tip

- A procedure can be viewed as the equivalent of a REST-endpoint or a function.
- There's no internal difference between queries and mutations apart from semantics.
- Defining publicProcedure is the same for queries, mutations, and subscription with the exception that subscriptions need to return an `observable` instance.

:::

## Example without input validation

```ts twoslash
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();


export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: _app.ts
// @noErrors
// ---cut---
import { router, publicProcedure } from './trpc';
import { z } from 'zod';

const appRouter = router({
  // Create publicProcedure at path 'hello'
  hello: publicProcedure.query(() => {
    return {
      greeting: 'hello world',
    };
  }),
});

```

## Input validation

tRPC works out-of-the-box with yup/superstruct/zod/myzod/custom validators/[..] - [see test suite](https://github.com/trpc/trpc/blob/main/packages/tests/server/validators.test.ts)

### With [Zod](https://github.com/colinhacks/zod)

```ts twoslash

// @filename: trpc.ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;

// @filename: _app.ts
// ---cut---
import { publicProcedure, router } from './trpc';
import { z } from 'zod';

export const appRouter = router({
  hello: publicProcedure
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

export const appRouter = router({
  hello: publicProcedure
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

export const appRouter = router({
  hello: publicProcedure
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

### With [scale-ts](https://github.com/paritytech/scale-ts)

```tsx
import { initTRPC } from '@trpc/server';
import * as $ from 'scale-ts';

export const t = initTRPC.create();

export const appRouter = router({
  hello: publicProcedure
    .input($.object($.field('text', $.str)))
    .query(({ input }) => ({ greeting: `hello ${input.text}` })),
});

export type AppRouter = typeof appRouter;
```

## Multiple input parsers {#multiple-input-parsers}

You're able to chain multiple parsers in order to make reusable publicProcedures for different parts of your application.

```ts twoslash
// @filename: trpc.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const middleware = t.middleware;
export const router = t.router;


/**
 * Public, unprotected publicProcedure
 **/
export const publicProcedure = t.procedure;


// ---cut---

// ------------------------------
// @filename: roomProcedure.ts
// ------------------------------
import { publicProcedure } from './trpc';
import { z } from 'zod';

/**
 * Create reusable publicProcedure for a chat room
 */
export const roomProcedure = publicProcedure.input(
  z.object({
    roomId: z.string(),
  }),
);

// ------------------------------
// @filename: _app.ts
// ------------------------------
import { router } from './trpc';
import { roomProcedure } from './roomProcedure';
import { z } from 'zod';


const appRouter = router({
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

To add multiple publicProcedures, you define them as properties on the object passed to `t.router()`.

```tsx
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

const router = t.router;
const publicProcedure = t.procedure;

export const appRouter = router({
  hello: publicProcedure.query(() => {
    return {
      text: 'hello world',
    };
  }),
  bye: publicProcedure.query(() => {
    return {
      text: 'goodbye',
    };
  }),
});

export type AppRouter = typeof appRouter;
```

## Reusable base procedures {#reusable-base-procedures}

You can create reusable base procedures to have a set of login-protected procedures.

:::tip
This can be combined with [multiple input parsers](#multiple-input-parsers) & [metadata](metadata.md) to create powerful reusable authorization and authentication patterns.
:::

```tsx twoslash
// -------------------------------------------------
// @filename: context.ts
// -------------------------------------------------

import { inferAsyncReturnType } from '@trpc/server';
import * as trpcNext from '@trpc/server/adapters/next';
import { getSession } from 'next-auth/react';

/**
 * Creates context for an incoming request
 * @link https://trpc.io/docs/context
 */
export async function createContext(opts: trpcNext.CreateNextContextOptions) {
  const session = await getSession({ req: opts.req });

  return {
    session,
  };
};

export type Context = inferAsyncReturnType<typeof createContext>;

// -------------------------------------------------
// @filename: trpc.ts
// -------------------------------------------------
import { initTRPC, TRPCError } from '@trpc/server';
import { Context } from './context';

const t = initTRPC.context<Context>().create();

/**
 * Reusable middleware that checks if users are authenticated.
 **/
const isAuthed = t.middleware(({ next, ctx }) => {
  if (!ctx.session?.user?.email) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
    });
  }
  return next({
    ctx: {
      // Infers the `session` as non-nullable
      session: ctx.session,
    },
  });
});

export const middleware = t.middleware;
export const router = t.router;

/**
 * Unprotected procedure
 **/
export const publicProcedure = t.procedure;

/**
 * Protected procedure
 **/
export const protectedProcedure = t.procedure.use(isAuthed);

// -------------------------------------------------
// @filename: _app.ts
// -------------------------------------------------
import { protectedProcedure, publicProcedure, router } from './trpc';
import { z } from 'zod';

export const appRouter = router({
  createPost: protectedProcedure
    .mutation(({ ctx }) => {
      const session = ctx.session;
      //      ^?
      // [...]
    }),
  whoami: publicProcedure
    .query(({ ctx }) => {
      const session = ctx.session;
      //      ^?
      // [...]
    }),
});
```
