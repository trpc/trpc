---
title: Aborting Procedure Calls
---

tRPC adheres to the industry standard when it comes to aborting procedures. All you have to do is pass an `AbortSignal` to the query or mutation options, and call the `AbortController` instance's `abort` method if you need to cancel the request.

```ts title="utils.ts"
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server.ts';

const proxy = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

// 1. Create an AbortController instance - this is a standard javascript API
const ac = new AbortController();

// 2. Pass the signal to a query or mutation
const query = proxy.userById.query('id_bilbo', { signal: ac.signal });

// 3. Cancel the request if needed
ac.abort();
```
