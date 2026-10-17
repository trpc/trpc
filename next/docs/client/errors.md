---
title: Errors without try/catch
description: safe() and createSafeClient() return result tuples with typed, narrowable errors.
section: Client
order: 4
---

`safe()` wraps a call and resolves to a result instead of rejecting. Destructure it as a tuple or as an object:

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
// ---cut-end---
import { safe } from '@trpc12/trpc/client';

const [post, error] = await safe(client.post.byId.query({ id: '1' }));
const { data, error: err } = await safe(
  client.post.create.mutate({ title: 'Hi' }),
);
```

`createSafeClient(client)` returns a client whose every call is safe:

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
// ---cut-end---
import { createSafeClient } from '@trpc12/trpc/client';

const safeClient = createSafeClient(client);
const [p, e] = await safeClient.post.byId.query({ id: '1' });
```

## Narrowing

`error.defined` is true for errors in the procedure's union, whether returned, failed or declared on the server ([Errors](../server/errors.md)), and for errors links declare ([Custom links](./custom-links.md#errors-and-unsupported-types)). Narrow on `code` next, and `data` takes that error's type:

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
import { safe } from '@trpc12/trpc/client';
// ---cut-end---
const [created, err] = await safe(client.post.create.mutate({ title: '' }));
if (err?.defined) {
  err.code;
  //  ^?
}
```

It is false for anything else: undeclared thrown errors, network failures (`NETWORK_ERROR`), aborts (`CLIENT_CLOSED_REQUEST`). `isDefinedError(error)` and `isTrpcError(error)` check a caught value.
