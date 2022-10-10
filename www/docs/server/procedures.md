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

const t = initTRPC.create();


export const middleware = t.middleware;
export const router = t.router;
export const procedure = t.procedure;

// @filename: _app.ts
// @noErrors
// ---cut---
import { router, procedure } from './trpc';
import { z } from 'zod';

const appRouter = router({
  // Create procedure at path 'hello'
  hello: procedure.query(() => {
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

const t = initTRPC.create();

export const middleware = t.middleware;
export const router = t.router;
export const procedure = t.procedure;

// @filename: _app.ts
// ---cut---
import { procedure, router } from './trpc';
import { z } from 'zod';

export const appRouter = router({
  hello: procedure
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
  hello: procedure
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
  hello: procedure
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
import { z } from 'zod';

const t = initTRPC.create();

export const middleware = t.middleware;
export const router = t.router;

/**
 * Public, unprotected procedure
 **/
export const publicProcedure = t.procedure;


/**
 * Create reusable procedure for a chat room
 */
export const roomProcedure = t.procedure.input(
  z.object({
    roomId: z.string(),
  }),
);

// @filename: _app.ts
import { roomProcedure, router } from './trpc';
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

To add multiple procedures, you define them as properties on the object passed to `t.router()`.

```tsx
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

export const appRouter = router({
  hello: procedure.query(() => {
    return {
      text: 'hello world',
    };
  }),
  bye: procedure.query(() => {
    return {
      text: 'goodbye',
    };
  }),
});

export type AppRouter = typeof appRouter;
```

## Reusable base procedures


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