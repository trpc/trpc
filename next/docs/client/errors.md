---
title: Errors without try/catch
description: '`safe()` returns a result tuple whose error lists every way a call can fail; switch on its code, or let `matchError()` check you handled each one.'
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

`error` is a `TrpcError`, and its type lists every way the call can fail, in three groups:

- **Defined errors** (`defined: true`): the procedure's own. They're the errors it returns, fails with or declares on the server ([Errors](../server/errors.md)), its input's `BAD_REQUEST` with `data.issues`, and errors links declare ([Custom links](./custom-links.md#errors-and-unsupported-types)). Each code has its `data` type.
- **Built-in errors** (`defined: false`, the `BuiltinError` type): one member per built-in code, and they never have `data`.
- **Undeclared errors** (`defined: false`, the `UndeclaredError` type): a custom code thrown by a procedure that declares no errors, with its `data`, both untyped. No literal matches its code type, so `switch` cases skip it.

| Built-in code               | When                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NETWORK_ERROR`             | The request got no response, or the connection dropped. Only from links that send requests.                                                                            |
| `BAD_RESPONSE`              | The response wasn't a tRPC one and its status names no code (an HTML page or an empty body sent with `200`), or it didn't decode. Only from links that read responses. |
| `STREAM_INTERRUPTED`        | A stream stopped without an end or an error, after its call resolved: a subscription's, or a streamed output's. Only from links that read streams.                     |
| `CLIENT_CLOSED_REQUEST`     | The call's `signal` aborted it.                                                                                                                                        |
| `CLIENT_ERROR`              | A link failed, or failed with a custom code it didn't declare.                                                                                                         |
| `INTERNAL_SERVER_ERROR`     | The server crashed, or threw a custom code that its `.errors()` don't list. The message is masked in production.                                                       |
| Any other code (`CONFLICT`) | The server threw it without declaring it, a proxy answered with its status (`401` is `UNAUTHORIZED`), or the server lacks the procedure (`NOT_FOUND`).                 |

### Errors from the links

The first three codes, the `LinkErrorCode` type, are made only by links, so a call's error has those its client's links declare and no others. `STREAM_INTERRUPTED` is only in the error of a call that streams: a subscription, or a procedure whose output is an `AsyncIterable` or `Stream` ([streamed queries](../integrations/tanstack-query.md) report it as the query's error). Any other call has its result before anything can be cut: a response that ends before it is `NETWORK_ERROR` or `BAD_RESPONSE`, and a `Promise` deferred inside the output rejects with `STREAM_INTERRUPTED` on its own. With only `localLink`, which runs calls in-process, no call can fail with `NETWORK_ERROR`, and `switch (err.code)` can't have a `case 'NETWORK_ERROR'`. The other codes can reach any call.

The same call has all three through `httpLink` and none through `localLink`:

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  localLink,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { appRouter, type AppRouter } from './server.ts';
declare const url: string;
// ---cut-end---
import type { LinkErrorCode } from '@trpc12/trpc/client';

const overHttp = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url })],
});
const inProcess = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    localLink({ router: appRouter, createContext: () => ({ user: null }) }),
  ],
});

const [, httpErr] = await safe(overHttp.post.list.query());
if (httpErr) {
  type HttpCodes = Extract<typeof httpErr.code, LinkErrorCode>;
  //   ^?
}
const [, localErr] = await safe(inProcess.post.list.query());
if (localErr) {
  type LocalCodes = Extract<typeof localErr.code, LinkErrorCode>;
  //   ^?
}
```

| Link                                                                             | Link codes it declares                                |
| -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `httpLink`                                                                       | `NETWORK_ERROR`, `BAD_RESPONSE`, `STREAM_INTERRUPTED` |
| `wsLink`, `experimental_messagePortLink`, `experimental_socketLink`              | `NETWORK_ERROR`, `BAD_RESPONSE`, `STREAM_INTERRUPTED` |
| `experimental_openApiLink`                                                       | `NETWORK_ERROR`, `BAD_RESPONSE`                       |
| `experimental_validationLink`                                                    | `BAD_RESPONSE` (a result that fails its schema)       |
| `splitLink`, `switchLink`                                                        | What their chains declare                             |
| `localLink`, `retryLink`, `dedupeLink`, `loggerLink`, `experimental_durableLink` | None                                                  |

`createRouterClient` declares none, since it calls the router in-process. A client typed without its links, like `TrpcClient<AppRouter>`, has all three, so it accepts a client with any links. A [custom link](./custom-links.md#errors-and-unsupported-types) declares the link codes it makes with `builtinErrors`, and can add codes of its own with `errors`.

The other built-in codes fall into four categories, which `ERROR_CATEGORY` maps each code to, since a call site usually does the same for every code in one. Undeclared errors are `rejected`:

| Category      | Codes                                                                                                                                                                                | Usually                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| `rejected`    | Built-in 4xx codes (`UNAUTHORIZED`, `NOT_FOUND`, `BAD_REQUEST`, …), requests the server couldn't take (`PARSE_ERROR`, `PAYLOAD_TOO_LARGE`, …), `CLIENT_ERROR`, and undeclared errors | Show the message, or reload |
| `unavailable` | `NETWORK_ERROR`, `BAD_RESPONSE`, `STREAM_INTERRUPTED`, `TIMEOUT`, `TOO_MANY_REQUESTS`, `BAD_GATEWAY`, `SERVICE_UNAVAILABLE`, `GATEWAY_TIMEOUT`                                       | Try again later             |
| `failed`      | `INTERNAL_SERVER_ERROR`, `NOT_IMPLEMENTED`                                                                                                                                           | Report it                   |
| `aborted`     | `CLIENT_CLOSED_REQUEST`                                                                                                                                                              | Ignore it                   |

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

## Handling every error

`matchError(err, handlers)` takes a handler for each error the call's type lists by code, all required: each defined code, getting that error with its `data`, and each link code the client's links declare. `unexpected` takes the rest, and is required too: the built-in codes nothing declared (a crash, an abort, a proxy's status) and undeclared errors, which a `switch` on `e.code` narrows further. It returns what the handler returns:

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
      NETWORK_ERROR: () => 'You are offline',
      BAD_RESPONSE: () => 'Try again later',
      unexpected: (e) =>
        e.code === 'CLIENT_CLOSED_REQUEST' ? 'Cancelled' : e.message,
    });
  }
  return post.title;
}
```

Errors that share a code share its handler, which gets their union: a defined `NETWORK_ERROR` and the link's, or two `NOT_FOUND`s with different `data`. A built-in error with a defined code, like the `NOT_FOUND` of a procedure the server lacks, goes to `unexpected`.

The link codes are the same for every call through a client that doesn't stream, so one object of their handlers can be spread into each `matchError()` (a streamed call adds `STREAM_INTERRUPTED`):

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
import { matchError, safe } from '@trpc12/trpc/client';
// ---cut-end---
const offline = {
  NETWORK_ERROR: () => 'You are offline',
  BAD_RESPONSE: () => 'Try again later',
};

const [, err] = await safe(client.post.byId.query({ id: '1' }));
if (err) {
  matchError(err, {
    ...offline,
    NOT_FOUND: (e) => `No post ${e.data.id}`,
    BAD_REQUEST: (e) => e.data.issues[0]?.message ?? 'Invalid id',
    unexpected: (e) => e.message,
  });
}
```

A handler missing for one of the call's codes, or left over for a code it no longer has, is a type error, so adding an error on the server ([Errors](../server/errors.md#when-a-procedure-adds-an-error)), or a link that can fail in a new way ([below](#when-the-links-change)), shows every place that must handle it. So is a key for a link code the client's links don't declare (`NETWORK_ERROR` with only `localLink`), and `unexpected` once every error has its own key; the error names the key (`'GONE' handles no error of this call`). The catch-all is never implied:

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
    unexpected: (e) => e.message,
  });
}
```

### When the links change

A link's codes are keys of every `matchError()` on its client. Adding a link that declares a code, like `rateLimit` from [Custom links](./custom-links.md#errors-and-unsupported-types), makes each `matchError()` without that key a type error. Removing it makes the key left over a type error (`offline` is the object of link handlers from above):

```ts twoslash
// @errors: 2345 2322
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  link,
  matchError,
  routerType,
  safe,
  TrpcError,
} from '@trpc12/trpc/client';
import { Schema, Stream } from 'effect';
import type { AppRouter } from './server.ts';
declare const url: string;
declare const budget: { take(): boolean };
class RateLimited extends TrpcError.Tagged('RATE_LIMITED', {
  data: Schema.Struct({ retryAfter: Schema.Number }),
}) {}
const rateLimit = link<{ errors: RateLimited }>((opts) =>
  budget.take()
    ? opts.next(opts.op)
    : Stream.fail(new RateLimited({ retryAfter: 5 })),
);
const offline = {
  NETWORK_ERROR: () => 'You are offline',
  BAD_RESPONSE: () => 'Try again later',
};
// ---cut-end---
const limited = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [rateLimit, httpLink({ url })],
});
const [, err] = await safe(limited.post.list.query());
if (err) {
  matchError(err, { ...offline, unexpected: (e) => e.message });
}

const plain = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url })],
});
const [, plainErr] = await safe(plain.post.list.query());
if (plainErr) {
  matchError(plainErr, {
    ...offline,
    RATE_LIMITED: () => 'Slow down',
    unexpected: (e) => e.message,
  });
}
```

## Checking a caught value

`isTrpcError(value)` checks a value from a `catch`, and `isDefinedError(error)` narrows to the defined errors. In the [Effect client](./effect.md) the same union is the error channel, and an error's `_tag` is its code, so `Effect.catchTag('NETWORK_ERROR', …)` handles one member.

`safe()` doesn't catch a framework's control flow: Next's `redirect()` and `notFound()`, which in-process calls rethrow ([Server Actions](../integrations/server-actions.md)), still throw.

## Credits

`safe()`, `createSafeClient()` and `isDefinedError()` follow [oRPC's client error handling](https://orpc.dev/docs/client/error-handling). The closed error union and `matchError()` follow [result-rpc](https://result-rpc.com/)'s errors as values.
