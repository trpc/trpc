---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /client/aborting-procedure-calls
---


tRPC adheres to the industry standard when it comes to aborting procedures. All you have to do is pass an `AbortSignal` to the query-options and then call its parent `AbortController`'s `abort` method.

```ts twoslash title="utils.ts"
// @target: esnext
// ---cut---
// @filename: server.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
// @noErrors
import type { AppRouter } from 'server.ts';

const proxy = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

const ac = new AbortController();
const query = proxy.userById.query('id_bilbo', { signal: ac.signal });

// Cancelling
ac.abort();

console.log(query.status);
```

> Note: The vanilla tRPC client allows aborting both queries and mutations
