---
id: retry
title: Retry Link
sidebar_label: Retry Link
slug: /links/retry
---

`retryLink` is a link that allows you to retry an operation a certain amount of times. It's helpful in times where the operation fails and returns an error, but you don't want to immediately handle it and would rather try the operation again.

## Usage

You can import and add the `retryLink` to the `links` array as such:

```ts title="client/index.ts"
import { createTRPCProxyClient, httpBatchLink, retryLink } from '@trpc/client';
import type { AppRouter } from '../server';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    retryLink({ attempts: 3 }),
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

## `retryLink` Options

The `retryLink` function takes an options object that only one field:

- `attempts`: the number of attempts `retryLink` will try to get a successful operation result.

```ts
function retryLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  attempts: number;
}) => TRPCLink<TRouter>
```
