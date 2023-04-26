---
id: validators
title: Input & Output Validators
sidebar_label: Input & Output Validators
slug: /server/validators
---

tRPC procedures may define validation logic for their input and/or output. There is first class support for many popular validators, and you can also [integrate validators](#contributing-your-own-validator-library) which we don't directly support.

### Input Validators

By defining an input validator, tRPC can check that a procedure call is correct and return a validation error if not. 

To set up an input validator, use the `procedure.input()` method:

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();
const publicProcedure = t.procedure

// ---cut---

export const appRouter = t.router({
  hello: publicProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query((opts) => {
      const name = opts.input.name;
      //    ^?
      return {
        greeting: `Hello ${opts.input.name}`,
      };
    }),
});
```

`.input` can also be stacked to build more complex types, which is particularly useful when you want to utilise some common input to a collection of procedures in a [middleware](middlewares).

```ts twoslash
// @target: esnext
import { TRPCError, initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

// ---cut---

const procedureWhichRejectsOutOfTownFolk = t.procedure
  .input(z.object({ townName: z.string() }))
  .use((opts) => {
    if (opts.input.townName !== 'Pucklechurch') {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: "We don't take kindly to out-of-town folk",
      });
    }

    return opts.next();
  });

export const appRouter = t.router({
  hello: procedureWhichRejectsOutOfTownFolk
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query((opts) => {
      const input = opts.input;
      //    ^?
      return {
        greeting: `Hello ${input.name}, my friend`,
      };
    }),
});
```

### Output Validators

By defining an output validator, tRPC can also check that data returned from untrusted sources is correct, or to strip extraneous data. Defining outputs is not always as important as defining inputs, since tRPC gives you automatic type-safety by inferring the return type of your procedures.

Validators are used to infer the input and output types of your procedures.

:::info
If output validation fails, the server will respond with an `INTERNAL_SERVER_ERROR`.
:::

## The most basic validator: a function

You can define a validator without any 3rd party dependencies, with a function. This isn't necessarily the best choice to use widely, unless you have a specific need, but it's important to understand that there's no magic here - it's *just typescript*!

:::info
In most cases we recommend you use a [Validator library](#validator-integrations)
:::

```ts twoslash
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

const publicProcedure = t.procedure

export const appRouter = t.router({
  hello: publicProcedure
    .input((value: any): { name: string } => {
      if (value && typeof value.name === 'string') {
        return { name: value.name };
      }
      throw new Error('Greeting not found');
    })
    .output((value: any) => {
      if (value && typeof value.greeting === 'string') {
        return { greeting: value.greeting };
      }
      throw new Error('Greeting not found');
    })
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input.name}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

## Validator integrations

tRPC works out of the box with a number of popular validation and parsing libraries. The below are some examples of usage with validators which we officially maintain support for.

### With [Zod](https://github.com/colinhacks/zod)

Zod is our default recommendation, it has a strong ecosystem which makes it a great choice to use in multiple parts of your codebase. If you have no opinion of your own and want a powerful library which won't limit future needs, Zod is a great choice.

```ts twoslash
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

const publicProcedure = t.procedure

export const appRouter = t.router({
  hello: publicProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .output(
      z.object({
        greeting: z.string(),
      }),
    )
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input.name}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [Yup](https://github.com/jquense/yup)

```ts twoslash
import { initTRPC } from '@trpc/server';
import * as yup from 'yup';

export const t = initTRPC.create();

const publicProcedure = t.procedure

export const appRouter = t.router({
  hello: publicProcedure
    .input(
      yup.object({
        name: yup.string().required(),
      }),
    )
    .output(
      yup.object({
        greeting: yup.string().required(),
      }),
    )
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input.name}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [Superstruct](https://github.com/ianstormtaylor/superstruct)

```ts twoslash
import { initTRPC } from '@trpc/server';
import { object, string } from 'superstruct';

export const t = initTRPC.create();

const publicProcedure = t.procedure

export const appRouter = t.router({
  hello: publicProcedure
    .input(object({ name: string() }))
    .output(object({ greeting: string() }))
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input.name}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [scale-ts](https://github.com/paritytech/scale-ts)

```ts twoslash
import { initTRPC } from '@trpc/server';
import * as $ from 'scale-codec';

export const t = initTRPC.create();

const publicProcedure = t.procedure

export const appRouter = t.router({
  hello: publicProcedure
    .input($.object($.field('name', $.str)))
    .output($.object($.field('greeting', $.str)))
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input.name}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [Typia](https://typia.io/docs/utilization/trpc/)

```ts
import { initTRPC } from '@trpc/server';
import typia from 'typia';
import { v4 } from 'uuid';
import { IBbsArticle } from '../structures/IBbsArticle';

const t = initTRPC.create();

const publicProcedure = t.procedure

export const appRouter = t.router({
  store: publicProcedure
    .input(typia.createAssert<IBbsArticle.IStore>())
    .output(typia.createAssert<IBbsArticle>())
    .query(({ input }) => {
      return {
        id: v4(),
        writer: input.writer,
        title: input.title,
        body: input.body,
        created_at: new Date().toString(),
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [ArkType](https://github.com/arktypeio/arktype#trpc)

```ts twoslash
import { initTRPC } from '@trpc/server';
import { type } from 'arktype';

export const t = initTRPC.create();

const publicProcedure = t.procedure

export const appRouter = t.router({
  hello: publicProcedure
    .input(type({ name: 'string' }).assert)
    .output(type({ greeting: 'string' }).assert)
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input.name}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [@effect/schema](https://github.com/Effect-TS/schema)

```ts twoslash
import * as S from '@effect/schema/Schema';
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

const publicProcedure = t.procedure

export const appRouter = t.router({
  hello: publicProcedure
    .input(S.parse(S.struct({ name: S.string })))
    .output(S.parse(S.struct({ greeting: S.string })))
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input.name}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

## Contributing your own Validator Library

If you work on a validator library which supports tRPC usage, please feel free to open a PR for this page with equivalent usage to the other examples here, and a link to your docs.

Integration with tRPC in most cases is as simple as meeting one of several existing type interfaces, but in some cases we may accept a PR to add a new supported interface. Feel free to open an issue for discussion. You can check the existing supported interfaces here:

- [Types for Inference](https://github.com/trpc/trpc/blob/main/packages/server/src/core/parser.ts)
- [Functions for parsing/validation](https://github.com/trpc/trpc/blob/main/packages/server/src/core/internals/getParseFn.ts)
