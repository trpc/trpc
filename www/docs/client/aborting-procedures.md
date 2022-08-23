---
id: query-cancellation
title: Query Cancellation
sidebar_label: Query Cancellation
slug: /query-cancellation
---

_If you're looking for how to abort queries and is using @trpc/react, please refer to @tanstack/react-query's [documentation](https://tanstack.com/query/v4/docs/guides/query-cancellation?from=reactQueryV3&original=https://react-query-v3.tanstack.com/guides/query-cancellation#manual-cancellation)._

tRPC adheres to the industry standard when it comes to aborting procedures. All you have to do is pass an `AbortSignal` to the query-options and then call its parent `AbortController`'s `abort` method.

```ts twoslash title="client.ts"
// @module: esnext

// ---cut---
// @filename: server.ts
import { createTRPCProxyClient } from "@trpc/client";
// @noErrors
import type { AppRouter } from "server.ts";

const proxy = createTRPCProxyClient<AppRouter>({
  url: "http://localhost:3000/trpc",
});

const ac = new AbortController();
const query = proxy.userById.query('id_bilbo', { signal: ac.signal });
//    ^?

// Cancelling
ac.abort();

console.log(query.status);
//                ^?
```

> Note: The vanilla tRPC client allows aborting both queries and mutations, however @tanstack/react-query only allows aborting queries.
