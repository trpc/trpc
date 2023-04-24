---
id: validators
title: Validating Inputs & Outputs
sidebar_label: Validating Inputs & Outputs
slug: /server/validators
---

tRPC procedures may define an input and/or an output. It's flexible too, so we support many different validators, and it's easy to integrate a validator which we don't directly support.

### Input Validators

By defining an input validator, tRPC can check that a procedure call is correct and return a validation error if not. Just use the `.input()` method when writing your procedures.

```ts twoslash
// @target: esnext
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();
// ---cut---

export const appRouter = t.router({
  hello: t.procedure
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
        message: "We don't take kindly to out-of-town folk"
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

## Validator integrations

tRPC works out of the box with a number of popular validation and parsing libraries. The below are some examples of usage with validators which we officially maintain support for.

### With [Zod](https://github.com/colinhacks/zod)

Zod is our default recommendation, it has a strong ecosystem which makes it a great choice to use in multiple parts of your codebase. If you have no opinion of your own and want a powerful library which won't limit future needs, Zod is a great choice.

```ts twoslash
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .output(
      z.object({
        greeting: z.string(),
      }),
    )
    // expects return type of { greeting: string }
    .query(() => {
      return {
        greeting: 'hello',
      };
    }),
});

export type AppRouter = typeof appRouter;
```

### Writing a custom validator

If you like, you can simply pass a function as a validator, though this isn't necessarily the best choice to use widely unless you have a specific need.

```ts twoslash
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .output((value: any) => {
      if (value && typeof value.greeting === 'string') {
        return { greeting: value.greeting };
      }
      throw new Error('Greeting not found');
    })
    // expects return type of { greeting: string }
    .query(() => {
      return {
        greeting: 'hello',
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

export const appRouter = t.router({
  hello: t.procedure
    .output(
      yup.object({
        greeting: yup.string().required(),
      }),
    )
    .query(() => {
      return {
        greeting: 'hello',
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

export const appRouter = t.router({
  hello: t.procedure
    .input(string())
    .output(object({ greeting: string() }))
    .query(({ input }) => {
      return {
        greeting: input,
      };
    }),
});

export type AppRouter = typeof appRouter;
```

## Community integrations

A number of other community libraries have opted to support tRPC integrations::

* [typia](https://typia.io/docs/utilization/trpc/)

If you would like your own validator to be list here, please feel free to open a pull request.
