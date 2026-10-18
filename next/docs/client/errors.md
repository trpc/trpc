---
title: Errors without try/catch
description: safe() returns a result tuple whose error lists every way a call can fail; switch on its code, or let matchError() check you handled each one.
section: Client
order: 4
v11: client/vanilla/error-handling
---

`safe()` wraps a call and resolves to `[data, error]` instead of rejecting. Check `error` first: once it's handled, `data` has the output's type, with no `undefined` left to check:

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
// ---cut-end---
import { safe } from '@trpc12/trpc/client';

async function title(id: string) {
  const [post, err] = await safe(client.post.byId.query({ id }));
  if (err) return err.message;
  return post.title;
  //     ^?
}
```

Don't check `data` instead: an output can be `undefined`, `null` or `0` too, and the error would go unhandled. The result is also an object, `{ data, error }`, for code that reads it without destructuring.

`createSafeClient(client)` returns a client whose every query and mutation is safe:

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
// ---cut-end---
import { createSafeClient } from '@trpc12/trpc/client';

const safeClient = createSafeClient(client);
const [post, err] = await safeClient.post.byId.query({ id: '1' });
```

## What a call can fail with

`error` is a `TrpcError`, and its type lists every way the call can fail. Each member has a literal `code`, in one of two groups:

- **Defined errors** (`defined: true`): the procedure's own. They're the errors it returns, fails with or declares on the server ([Errors](../server/errors.md)), its input's `BAD_REQUEST` with `data.issues`, and errors links declare ([Custom links](./custom-links.md#errors-and-unsupported-types)). Each code has its `data` type.
- **Built-in errors** (`defined: false`, the `BuiltinError` type): one member per built-in code, and they never have `data`.

| Built-in code               | When                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NETWORK_ERROR`             | The request got no response.                                                                                                                           |
| `CLIENT_CLOSED_REQUEST`     | The call's `signal` aborted it.                                                                                                                        |
| `BAD_RESPONSE`              | The response wasn't a tRPC one (a proxy's HTML page) or didn't decode.                                                                                 |
| `STREAM_INTERRUPTED`        | A stream stopped without an end or an error.                                                                                                           |
| `CLIENT_ERROR`              | A link failed, or failed with a custom code it didn't declare.                                                                                         |
| `INTERNAL_SERVER_ERROR`     | The server crashed, or threw a custom code it didn't declare. The message is masked in production.                                                     |
| Any other code (`CONFLICT`) | The server threw it without declaring it, a proxy answered with its status (`401` is `UNAUTHORIZED`), or the server lacks the procedure (`NOT_FOUND`). |

Built-in errors fall into four categories (`ERROR_CATEGORY` maps each code to one), since a call site usually does the same for every code in one:

| Category      | Codes                                                                                                                                                             | Usually                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `rejected`    | Built-in 4xx codes (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`, …), requests the server couldn't take (`PARSE_ERROR`, `PAYLOAD_TOO_LARGE`, …), and `CLIENT_ERROR` | Show the message, or reload |
| `unavailable` | `NETWORK_ERROR`, `BAD_RESPONSE`, `STREAM_INTERRUPTED`, `TIMEOUT`, `TOO_MANY_REQUESTS`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE`, `GATEWAY_TIMEOUT`                    | Try again later             |
| `failed`      | `INTERNAL_SERVER_ERROR`, `NOT_IMPLEMENTED`                                                                                                                        | Report it                   |
| `aborted`     | `CLIENT_CLOSED_REQUEST`                                                                                                                                           | Ignore it                   |

## Switching on the code

`switch (err.code)` narrows the error to the members with that code. A code can be in both groups: the server's `NOT_FOUND` for a missing post, and a built-in `NOT_FOUND` when the server doesn't have the procedure (a client deployed before its server). Until `err.defined` says which, `data` is the defined error's type or `undefined`:

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
import { safe } from '@trpc12/trpc/client';
// ---cut-end---
async function title(id: string) {
  const [post, err] = await safe(client.post.byId.query({ id }));
  if (err) {
    switch (err.code) {
      case 'NOT_FOUND':
        err.data;
        //  ^?
        return err.defined ? `No post ${err.data.id}` : 'Please reload';
      case 'NETWORK_ERROR':
        return 'You are offline';
      default:
        return err.message;
    }
  }
  return post.title;
}
```

## Handling every defined code

`matchError(err, handlers)` takes a handler per defined code, each getting that error with its `data`, and one per category of built-in errors, each getting that category's codes, which a `switch` on `e.code` narrows further. It returns what the handler returns:

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
import { safe } from '@trpc12/trpc/client';
// ---cut-end---
import { matchError } from '@trpc12/trpc/client';

async function title(id: string) {
  const [post, err] = await safe(client.post.byId.query({ id }));
  if (err) {
    return matchError(err, {
      NOT_FOUND: (e) => `No post ${e.data.id}`,
      BAD_REQUEST: (e) => e.data.issues[0]?.message ?? 'Invalid id',
      rejected: (e) => e.message,
      unavailable: (e) =>
        e.code === 'NETWORK_ERROR' ? 'You are offline' : 'Try again later',
      failed: () => 'Something went wrong',
      aborted: () => 'Cancelled',
    });
  }
  return post.title;
}
```

`builtin` handles the categories you don't list, so `builtin: (e) => e.message` alone takes every built-in error.

A handler missing for one of the procedure's codes, or left over for a code it no longer has, is a type error, so adding an error on the server shows every place that must handle it:

```ts twoslash
// @errors: 2345
// ---cut-start---
import { client } from './client.ts';
import { matchError, safe } from '@trpc12/trpc/client';
// ---cut-end---
const [, err] = await safe(client.post.byId.query({ id: '1' }));
if (err) {
  matchError(err, {
    NOT_FOUND: (e) => `No post ${e.data.id}`,
    builtin: (e) => e.message,
  });
}
```

A built-in error with a defined code, like the `NOT_FOUND` of a procedure the server lacks, goes to its category (`rejected`), or `builtin`.

## Checking a caught value

`isTrpcError(value)` checks a value from a `catch`, and `isDefinedError(error)` narrows to the defined errors. In the [Effect client](./effect.md) the same union is the error channel, and an error's `_tag` is its code, so `Effect.catchTag('NETWORK_ERROR', …)` handles one member.

`safe()` doesn't catch a framework's control flow: Next's `redirect()` and `notFound()`, which in-process calls rethrow ([Server Actions](../integrations/server-actions.md)), still throw.

## Credits

`safe()`, `createSafeClient()` and `isDefinedError()` follow [oRPC's client error handling](https://orpc.dev/docs/client/error-handling). The closed error union and `matchError()` follow [result-rpc](https://result-rpc.com/)'s errors as values.
