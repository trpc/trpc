---
title: "Aborting Procedure Calls"
description: ""
section: "Vanilla Client"
order: 47
---

tRPC supports the standard `AbortController`/`AbortSignal` API for aborting procedures. All you have to do is pass an `AbortSignal` to the query or mutation options, and call the `AbortController` instance's `abort` method if you need to cancel the request.

```ts title="utils.ts"
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

// 1. Create an AbortController instance - this is a standard javascript API
const ac = new AbortController();

// 2. Pass the signal to a query or mutation
const query = client.userById.query('id_bilbo', { signal: ac.signal });

// 3. Cancel the request if needed
ac.abort();
```
