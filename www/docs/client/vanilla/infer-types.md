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
  }),
});

export type AppRouter = typeof appRouter;
```

It is often useful to access the types of your API within your clients. For this purpose, you are able to infer the types contained in your `AppRouter`.

`@trpc/server` exports the following helper types to assist with inferring these types from the `AppRouter` exported by your `@trpc/server` router:

- `inferRouterInputs<TRouter>`
- `inferRouterOutputs<TRouter>`

## Inferring Input & Output Types

Let's assume we have this example router:

```ts twoslash title='server.ts'
// @include: server
```

Using the helpers, we can infer the types of our router. The following example shows how to infer the types of the `post.create` procedure:

```ts twoslash title="client.ts"
// @module: esnext
// @include: server
// ---cut---
// @filename: client.ts
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './server';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

type PostCreateInput = RouterInput['post']['create'];
//   ^?
type PostCreateOutput = RouterOutput['post']['create'];
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

// ---cut---
// @filename: client.ts
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
