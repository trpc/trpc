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

`createSafeClient(client)` returns a client on which nothing throws: every query and mutation is safe, and so is iterating a [streamed output or a subscription](#streamed-outputs-and-subscriptions):

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

- **Defined errors** (`defined: true`): the procedure's own. They're the errors it returns, fails with (a returned `Stream`'s failures too) or declares on the server ([Errors](../server/errors.md)), its input's `BAD_REQUEST` with `data.issues`, and errors links declare ([Custom links](./custom-links.md#errors-and-unsupported-types)). Each code has its `data` type, in the form it arrives in, as outputs do: a `Date` is a `string` over plain JSON, and a `Date` with progressive JSON ([Transformers](../server/transformers.md)).
- **Built-in errors** (`defined: false`, the `BuiltinError` type): one member per built-in code, each its code's class (`TrpcError.NotFound`, tagged `NotFound`), plus [the failures a client acts on](#the-failures-a-client-acts-on), which have their own tags. They never have `data`.
- **Undeclared errors** (`defined: false`, the `UndeclaredError` type): a custom code thrown by a procedure that declares no errors, with its `data`, both untyped. No literal matches its code type, so `switch` cases skip it.

| Built-in code               | When                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NETWORK_ERROR`             | The request got no response, or the connection dropped. Only from links that send requests.                                                                            |
| `BAD_RESPONSE`              | The response wasn't a tRPC one and its status names no code (an HTML page or an empty body sent with `200`), or it didn't decode. Only from links that read responses. |
| `STREAM_INTERRUPTED`        | A stream stopped without an end or an error, after its call resolved: a subscription's, or a streamed output's. Only from links that read streams.                     |
| `CLIENT_CLOSED_REQUEST`     | The call's `signal` aborted it, for any reason but a timeout.                                                                                                          |
| `TIMEOUT`                   | The call's `signal` timed out (`AbortSignal.timeout()`), or the server answered `408` ([below](#timeouts-and-cancels)).                                                |
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

### Timeouts and cancels

A call given `AbortSignal.timeout()` as its `signal` fails with `TIMEOUT` once it times out; any other abort, like `controller.abort()`, is `CLIENT_CLOSED_REQUEST`. So code that ignores cancels still sees a timeout. The signal's reason is the error's `cause`. Joined with a component's own signal by `AbortSignal.any()`, whichever aborts first names the error:

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
import { matchError, safe } from '@trpc12/trpc/client';
declare const signal: AbortSignal;
// ---cut-end---
const [, err] = await safe(
  client.post.byId.query(
    { id: '1' },
    { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
  ),
);
if (err) {
  matchError(err, {
    NOT_FOUND: (e) => `No post ${e.data.id}`,
    BAD_REQUEST: (e) => e.data.issues[0]?.message ?? 'Invalid id',
    NETWORK_ERROR: () => 'You are offline',
    BAD_RESPONSE: () => 'Try again later',
    unexpected: (e) =>
      e.code === 'TIMEOUT'
        ? 'That took too long'
        : e.code === 'CLIENT_CLOSED_REQUEST'
          ? null
          : e.message,
  });
}
```

`TIMEOUT` is a built-in code no link declares, since a server's `408` sends it too, so it goes to `unexpected` rather than a key of its own. Its status stays `408`, so `retryLink` doesn't retry it. It's the same on every link and client: the [Effect client](./effect.md), the safe client and the [TanStack Query](../integrations/tanstack-query.md#errors) hooks, whose `error` lists it. A subscription whose `signal` aborts still ends quietly, whatever the reason.

## Switching on the code

`switch (err.code)` narrows the error to the members with that code. A code can be in both groups: the server's `NOT_FOUND` for a missing post, and a built-in `NOT_FOUND` when the server doesn't have the procedure (a client deployed before its server). Until `err.defined` says which, `data` is the defined error's type or `undefined`, and the built-in one's `_tag` says which failure it was:

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
        if (err.defined) return `No post ${err.data.id}`;
        return err._tag === 'ProcedureNotFound' ? 'Please reload' : err.message;
      case 'NETWORK_ERROR':
        return 'You are offline';
      default:
        return err.message;
    }
  }
  return post.title;
}
```

### The failures a client acts on

Every error has a `_tag` naming its failure, which the [Effect client](./effect.md#errors) catches by. A defined error's is its class's, and a built-in error's is its code's class name (`NotFound`), except for three failures a client can do something about. They keep their code, so `switch` and `matchError()` see them as before:

- `ProcedureNotFound` (`NOT_FOUND`): the server has no procedure at the path, so the client is newer than the server (a deploy in progress, a cached bundle). Reload, or retry once the deploy is done.
- `ProcedureTypeMismatch` (`METHOD_NOT_SUPPORTED`): the procedure is a query on the server and a mutation on the client, or the other way. Reload.
- `TransformerMismatch` (`UNSUPPORTED_PROTOCOL`): the link and the server use different transformers. The link makes it, before the server runs anything. Fix the link's or the handler's config.

The server tells more failures apart (`BatchTooLarge`, `InvalidBody`, `RouteNotFound`, …: [Errors](../server/errors.md#in-effect-code)), which its `onError` sees. They reach clients as their code's class, so the wire carries a tag only for defined errors and these three.

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

## Streamed outputs and subscriptions

A [streamed output](../server/streaming.md#errors) and a [subscription](../subscriptions/overview.md) fail while they're iterated, after the call returned. Their iterables carry the call's errors, and `safe()` iterates them without throwing: each item is `[item, undefined]`, and a failure is a last `[undefined, error]`. Breaking out of the loop closes the stream, as with `for await` on its own. The error's type is the call's: the stream's failures, its link codes with `STREAM_INTERRUPTED`, and the rest for `unexpected`:

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { error } from '@trpc12/trpc/server';
import { Stream } from 'effect';
import { t } from './server.ts';
declare function render(seat: string): void;
const router = t.router({
  seats: t.procedure.query(() =>
    Stream.fromIterable(['A1', 'A2']).pipe(
      Stream.concat(
        Stream.fail(error({ code: 'SOLD_OUT', data: { sold: 2 } })),
      ),
    ),
  ),
});
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
const offline = {
  NETWORK_ERROR: () => 'You are offline',
  BAD_RESPONSE: () => 'Try again later',
};
// ---cut-end---
const [seats, err] = await safe(client.seats.query());
if (!err) {
  for await (const [seat, streamErr] of safe(seats)) {
    if (streamErr) {
      matchError(streamErr, {
        ...offline,
        SOLD_OUT: (e) => `Sold out after ${e.data.sold}`,
        STREAM_INTERRUPTED: () => 'The list was cut off',
        unexpected: (e) => e.message,
      });
      break;
    }
    render(seat);
  }
}
```

A client from `createSafeClient` iterates them this way on its own: its streamed output and `subscribe()` yield `[item, error]`, with no `safe()` around them. A `ReadableStream` output stays as it is: its bytes have no typed failures.

```ts twoslash
// ---cut-start---
import {
  createSafeClient,
  createTrpcClient,
  httpLink,
  routerType,
} from '@trpc12/trpc/client';
import { error } from '@trpc12/trpc/server';
import { Stream } from 'effect';
import { t } from './server.ts';
declare function render(seat: string): void;
const router = t.router({
  seats: t.procedure.query(() =>
    Stream.fromIterable(['A1', 'A2']).pipe(
      Stream.concat(
        Stream.fail(error({ code: 'SOLD_OUT', data: { sold: 2 } })),
      ),
    ),
  ),
  onSale: t.procedure.subscription(() => Stream.make('A3')),
});
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
// ---cut-end---
const safeClient = createSafeClient(client);

const [seats, err] = await safeClient.seats.query();
if (!err) {
  for await (const [seat, streamErr] of seats) {
    if (streamErr) break;
    render(seat);
  }
}

for await (const [seat, saleErr] of safeClient.onSale.subscribe()) {
  if (saleErr) break;
  render(seat);
}
```

`safe()` drops a generator's return value, as `for await` does: read it with the iterator itself. In the [Effect client](./effect.md), the call's error channel lists the stream's failures too, and its streamed output is the same iterable.

## Checking a caught value

`isTrpcError(value)` checks a value from a `catch`, and `isDefinedError(error)` narrows to the defined errors. In the [Effect client](./effect.md) the same union is the error channel, and each failure has its own `_tag`, so `Effect.catchTag('NetworkError', …)` handles one member.

`safe()` doesn't catch a framework's control flow: Next's `redirect()` and `notFound()`, which in-process calls rethrow ([Server Actions](../integrations/server-actions.md)), still throw.

## Credits

`safe()`, `createSafeClient()` and `isDefinedError()` follow [oRPC's client error handling](https://orpc.dev/docs/client/error-handling). The closed error union and `matchError()` follow [result-rpc](https://result-rpc.com/)'s errors as values.
