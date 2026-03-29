---
id: infer-types
title: Inferring Types
sidebar_label: Inferring Types
slug: /client/vanilla/infer-types
---

<!-- Reusable snippet -->

```twoslash include server
// @module: esnext
// @filename: server.ts
// ---cut---

import { initTRPC } from '@trpc/server';
import { z } from "zod";

const t = initTRPC.create();

const appRouter = t.router({
  post: t.router({
    list: t.procedure
      .query(() => {
        // imaginary db call
        return [{ id: 1, title: 'tRPC is the best!' }];
    }),
    byId: t.procedure
      .input(z.string())
      .query((opts) => {
        // imaginary db call
        return { id: 1, title: 'tRPC is the best!' };
    }),
    create: t.procedure
      .input(z.object({ title: z.string(), text: z.string(), }))
      .mutation((opts) => {
        // imaginary db call
        return { id: 1, ...opts.input };
    }),
    onPostAdd: t.procedure
      .input(z.object({ authorId: z.string() }))
      .subscription(async function* ({ input }) {
        // imaginary event source
        yield {
          id: 1,
          title: 'tRPC is the best!',
          authorId: input.authorId,
        };
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

It is often useful to access the types of your API within your clients. For this purpose, you are able to infer the types contained in your `AppRouter`.

`@trpc/server` exports the following helper types to assist with inferring these types from the `AppRouter` exported by your `@trpc/server` router:

- `inferRouterInputs<TRouter>`
- `inferRouterOutputs<TRouter>`
- `inferProcedureInput<TProcedure>`
- `inferProcedureOutput<TProcedure>`
- `inferSubscriptionInput<TProcedure>`
- `inferSubscriptionOutput<TProcedure>`

`@trpc/client` also exports:

- `inferProcedureClientError<TProcedure>`
- `inferSubscriptionClientError<TProcedure>`

## Inferring Input & Output Types

Let's assume we have this example router:

```ts twoslash title='server.ts'
// @include: server
```

Using the helpers, we can infer the types of our router. The following example shows how to infer the types of the `post.create` procedure:

```ts twoslash title="client.ts"
// @module: esnext
// @include: server
// @filename: client.ts
// ---cut---
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './server';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

type PostCreateInput = RouterInput['post']['create'];
//   ^?
type PostCreateOutput = RouterOutput['post']['create'];
//   ^?
```

## Inferring Individual Procedure Types

If you already have access to a specific procedure on your router, you can infer its input or output directly:

```ts twoslash title="client.ts"
// @module: esnext
// @include: server
// @filename: client.ts
// ---cut---
import type {
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import type { AppRouter } from './server';

type PostByIdInput = inferProcedureInput<AppRouter['post']['byId']>;
//   ^?
type PostByIdOutput = inferProcedureOutput<AppRouter['post']['byId']>;
//   ^?
```

For subscriptions, you can infer the subscription input and the emitted data type:

```ts twoslash title="client.ts"
// @module: esnext
// @include: server
// @filename: client.ts
// ---cut---
import type {
  inferSubscriptionInput,
  inferSubscriptionOutput,
} from '@trpc/server';
import type { AppRouter } from './server';

type OnPostAddInput = inferSubscriptionInput<AppRouter['post']['onPostAdd']>;
//   ^?
type OnPostAddOutput = inferSubscriptionOutput<AppRouter['post']['onPostAdd']>;
//   ^?
```

## Infer `TRPCClientError` types

It's also useful to infer the error type for your `AppRouter`

```ts twoslash title='client.ts'
// @module: esnext
// @include: server

// @filename: trpc.ts
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "./server";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://localhost:3000/api/trpc",
    }),
  ],
});

// @filename: client.ts
// ---cut---
import { TRPCClientError } from '@trpc/client';
import type { AppRouter } from './server';
import { trpc } from './trpc';

export function isTRPCClientError(
  cause: unknown,
): cause is TRPCClientError<AppRouter> {
  return cause instanceof TRPCClientError;
}

async function main() {
  try {
    await trpc.post.byId.query('1');
  } catch (cause) {
    if (isTRPCClientError(cause)) {
      // `cause` is now typed as your router's `TRPCClientError`
      console.log('data', cause.data);
      //                        ^?
    } else {
      // [...]
    }
  }
}

main();
```

You can also infer the client error type for any specific query/mutation/subscription procedure, which is useful for [declared errors](./todo-add-page-link.md)

```ts twoslash title='client.ts'
// @module: esnext
// @include: server
// @filename: client.ts
// ---cut---
import type {
  inferProcedureClientError,
  inferSubscriptionClientError,
} from '@trpc/client';
import type { AppRouter } from './server';

type PostByIdError = inferProcedureClientError<AppRouter['post']['byId']>;
//   ^?
type OnPostAddError =
  inferSubscriptionClientError<AppRouter['post']['onPostAdd']>;
//   ^?
```
