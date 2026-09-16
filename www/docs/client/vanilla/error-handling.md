---
id: error-handling
title: Error Handling
sidebar_label: Error Handling
slug: /client/vanilla/error-handling
---

```ts twoslash include server
// @module: esnext
// @filename: server.ts
// ---cut---

import { initTRPC } from '@trpc/server';
import { z } from "zod";

class RateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('Too many requests');
  }
}

const t = initTRPC.create();

const rateLimited = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'RATE_LIMIT' as const,
        retryAfterMs: opts.error.cause.retryAfterMs,
      },
    };
  }
  return undefined;
});

const appRouter = t.router({
  post: t.router({
    byId: rateLimited
      .input(z.string())
      .query((opts) => {
        // imaginary db call
        return { id: 1, title: 'tRPC is the best!' };
    }),
  }),
});

export type AppRouter = typeof appRouter;
```

A failed procedure call rejects with a [`TRPCClientError`](/docs/client/vanilla/infer-types#infer-trpcclienterror-types). You can either let it throw and catch it, or use `safe()` to get it back as a type-safe value.

## Catching a thrown error

`query()` and `mutate()` behave like any other promise, so a `try`/`catch` works as you would expect. TypeScript has no way to describe what a function throws, though, so `cause` arrives as `unknown` and has to be narrowed:

```ts twoslash title='client.ts'
// @target: esnext
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

try {
  const post = await trpc.post.byId.query('1');
} catch (cause) {
  if (cause instanceof TRPCClientError) {
    console.log(cause.data);
  } else {
    // something that isn't a tRPC error
  }
}
```

See [Inferring Types](/docs/client/vanilla/infer-types#infer-trpcclienterror-types) for a reusable `isTRPCClientError` guard.

## Errors as values with `safe()`

`safe()` awaits a `query()` or `mutate()` call without letting it throw, handing back a `[data, error]` pair instead. Exactly one side is ever set, so checking either one narrows the other:

```ts twoslash title='client.ts'
// @target: esnext
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
import { safe } from '@trpc/client';
import { trpc } from './trpc';

const [post, error] = await safe(trpc.post.byId.query('1'));

if (error) {
  console.log(error.data);
  //                ^?
} else {
  console.log(post.title);
}
```

:::info
Subscriptions don't need `safe()` - they never throw at the call site, and report failures through `onError`, which is already typed with the procedure's error shape.
:::
