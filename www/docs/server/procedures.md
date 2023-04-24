---
id: procedures
title: Define Procedures
sidebar_label: Define Procedures
slug: /server/procedures
---

In tRPC a Procedure is ultimately just a function which you want to expose to your client. A Procedure can be either:

- a `Query` - used to fetch data, generally does not change any data
- a `Mutation` - used to send data, often for create/update/delete purposes

Procedures in tRPC are very flexible primitives to create backend functions, they use an immutable builder pattern which means you can [create reusable base procedures](#reusable-base-procedures) which share functionality among multiple procedures.

:::tip

- A procedure can be viewed as the equivalent of a REST-endpoint, and under the hood are built on HTTP, but are more focused towards the needs of application, rather than representing "resources".
- There's no internal difference between queries and mutations apart from semantics.
- Defining a publicProcedure is the same for queries, mutations, and subscriptions, with the exception that subscriptions need to return an `observable` instance.

:::

## Writing procedures

Writing a procedure is simple, the `t` object you create during tRPC setup returns an initial `t.procedure` which all other procedures are built on:

```ts twoslash
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

export const router = t.router;
export const publicProcedure = t.procedure;

const appRouter = router({
  hello: publicProcedure.query(() => {
    return {
      message: 'hello world',
    };
  }),
  goodbye: publicProcedure.mutation(() => {
    return {
      message: 'goodbye!',
    };
  }),
});
```

## Reusable "Base Procedures" {#reusable-base-procedures}

You can create reusable base procedures, which can be consumed by numerous procedures in your application. This is a key pattern for code and behaviour re-use in tRPC and every application is likely to need it.

The below example takes a user input and [authorizes](https://en.wikipedia.org/wiki/Authorization) them like protective towns-people. This is obviously a contrived example for simplicity, and not an appropriate way to securely authorize an application user, so in practice you may want to use some combination of [Headers](/docs/client/headers), [Context](context), [Middleware](middlewares), and [Metadata](metadata), to [authenticate](https://en.wikipedia.org/wiki/Authentication) and authorize your users.

```ts twoslash
// @target: esnext
import { TRPCError, initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

// ---cut---
const authorizedProcedure = t.procedure
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
  hello: authorizedProcedure.query((opts) => {
    return {
      greeting: `Hello my friend`,
    };
  }),
  goodbye: authorizedProcedure.mutation(() => {
    return {
      message: 'goodbye!',
    };
  }),
});
```
