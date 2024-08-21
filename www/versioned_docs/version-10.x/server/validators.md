---
id: validators
title: Input & Output Validators
sidebar_label: Input & Output Validators
slug: /server/validators
---

tRPC procedures may define validation logic for their input and/or output, and validators are also used to infer the types of inputs and outputs. We have first class support for many popular validators, and you can [integrate validators](#contributing-your-own-validator-library) which we don't directly support.

## Input Validators

By defining an input validator, tRPC can check that a procedure call is correct and return a validation error if not.

To set up an input validator, use the `procedure.input()` method:

```ts
// @target: esnext
import { initTRPC } from '@trpc/server';
// ---cut---

// Our examples use Zod by default, but usage with other libraries is identical
import { z } from 'zod';

export const t = initTRPC.create();
const publicProcedure = t.procedure;

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

### Input Merging

`.input()` can be stacked to build more complex types, which is particularly useful when you want to utilise some common input to a collection of procedures in a [middleware](middlewares).

```ts
// @target: esnext
import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

// ---cut---

const baseProcedure = t.procedure
  .input(z.object({ townName: z.string() }))
  .use((opts) => {
    const input = opts.input;
    //    ^?

    console.log(`Handling request with user from: ${input.townName}`);

    return opts.next();
  });

export const appRouter = t.router({
  hello: baseProcedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query((opts) => {
      const input = opts.input;
      //    ^?
      return {
        greeting: `Hello ${input.name}, my friend from ${input.townName}`,
      };
    }),
});
```

## Output Validators

Validating outputs is not always as important as defining inputs, since tRPC gives you automatic type-safety by inferring the return type of your procedures. Some reasons to define an output validator include:

- Checking that data returned from untrusted sources is correct
- Ensure that you are not returning more data to the client than necessary

:::info
If output validation fails, the server will respond with an `INTERNAL_SERVER_ERROR`.
:::

```ts
// @target: esnext
import { initTRPC } from '@trpc/server';
// @noErrors
// ---cut---

import { z } from 'zod';

export const t = initTRPC.create();
const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure
    .output(
      z.object({
        greeting: z.string(),
      }),
    )
    .query((opts) => {
      return {
        gre,
        // ^|
      };
    }),
});
```

## The most basic validator: a function

You can define a validator without any 3rd party dependencies, with a function.

:::info
We don't recommend making a custom validator unless you have a specific need, but it's important to understand that there's no magic here - it's _just typescript_!

In most cases we recommend you use a [validation library](#library-integrations)
:::

```ts
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure
    .input((value): string => {
      if (typeof value === 'string') {
        return value;
      }
      throw new Error('Input is not a string');
    })
    .output((value): string => {
      if (typeof value === 'string') {
        return value;
      }
      throw new Error('Output is not a string');
    })
    .query((opts) => {
      const { input } = opts;
      //      ^?
      return `hello ${input}`;
    }),
});

export type AppRouter = typeof appRouter;
```

## Library integrations

tRPC works out of the box with a number of popular validation and parsing libraries. The below are some examples of usage with validators which we officially maintain support for.

### With [Zod](https://github.com/colinhacks/zod)

Zod is our default recommendation, it has a strong ecosystem which makes it a great choice to use in multiple parts of your codebase. If you have no opinion of your own and want a powerful library which won't limit future needs, Zod is a great choice.

```ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

const publicProcedure = t.procedure;

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

```ts
import { initTRPC } from '@trpc/server';
import * as yup from 'yup';

export const t = initTRPC.create();

const publicProcedure = t.procedure;

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

```ts
import { initTRPC } from '@trpc/server';
import { object, string } from 'superstruct';

export const t = initTRPC.create();

const publicProcedure = t.procedure;

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

```ts
import { initTRPC } from '@trpc/server';
import * as $ from 'scale-codec';

export const t = initTRPC.create();

const publicProcedure = t.procedure;

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

const publicProcedure = t.procedure;

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

```ts
import { initTRPC } from '@trpc/server';
import { type } from 'arktype';

export const t = initTRPC.create();

const publicProcedure = t.procedure;

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

### With [@effect/schema](https://github.com/Effect-TS/effect/tree/main/packages/schema)

```ts
import * as Schema from '@effect/schema/Schema';
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure
    .input(Schema.decodeUnknownSync(Schema.Struct({ name: Schema.String })))
    .output(
      Schema.decodeUnknownSync(Schema.Struct({ greeting: Schema.String })),
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

### With [runtypes](https://github.com/pelotom/runtypes)

```ts
import { initTRPC } from '@trpc/server';
import * as T from 'runtypes';

const t = initTRPC.create();
const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure
    .input(T.Record({ name: T.String }))
    .output(T.Record({ greeting: T.String }))
    .query(({ input }) => {
      //      ^?
      return {
        greeting: `hello ${input.name}`,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### With [Valibot](https://github.com/fabian-hiller/valibot)

```ts
import { wrap } from '@decs/typeschema';
import { initTRPC } from '@trpc/server';
import { object, string } from 'valibot';

export const t = initTRPC.create();

const publicProcedure = t.procedure;

export const appRouter = t.router({
  hello: publicProcedure
    .input(wrap(object({ name: string() })))
    .output(wrap(object({ greeting: string() })))
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
