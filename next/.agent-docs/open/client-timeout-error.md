---
title: Should a call that times out fail with `TIMEOUT` instead of looking like a call the user cancelled?
summary: A call cut by `AbortSignal.timeout()` fails with `CLIENT_CLOSED_REQUEST`, like a cancel; it could fail with the built-in `TIMEOUT` code instead.
area: errors
recommended: B
questions: [Q24.6]
links:
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
  - kind: decision
    label: closed-client-errors
    url: ../decisions/closed-client-errors.md
  - kind: decision
    label: granular-errors
    url: ../decisions/granular-errors.md
  - kind: decision
    label: link-errors
    url: ../decisions/link-errors.md
  - kind: code
    label: toHttpError (http/transport.ts)
    url: ../../packages/trpc/src/client/links/http/transport.ts
  - kind: code
    label: clientErrorFromCause (link.ts)
    url: ../../packages/trpc/src/client/link.ts
  - kind: docs
    label: Client errors
    url: https://v12.trpc.io/v12/docs/client/errors#handling-every-error
---

# Should a call that times out fail with `TIMEOUT` instead of looking like a call the user cancelled?

## Why it matters

`TIMEOUT` (status 408) is a built-in code, but only a server's 408 produces it. A call given `{ signal: AbortSignal.timeout(ms) }` fails with `CLIENT_CLOSED_REQUEST`, "The request was aborted", the same as a user's `controller.abort()`, so a handler that ignores cancels also swallows timeouts. The first half of Q24.6 shipped (`BAD_RESPONSE`); this is the second, left open in [granular-errors](../decisions/granular-errors.md).

## Options

### A) Keep it as it is

A timeout is an abort like any other.

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  report: {
    build: t.procedure
      .input(z.object({ id: z.string() }))
      .query(() => ({ url: '/reports/1.pdf' })),
  },
};
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
const offline = {
  NETWORK_ERROR: () => 'You are offline',
  BAD_RESPONSE: () => 'Try again later',
};
declare const id: string;
// ---cut-end---
const [, err] = await safe(
  client.report.build.query({ id }, { signal: AbortSignal.timeout(60_000) }),
);
if (err)
  matchError(err, {
    ...offline,
    BAD_REQUEST: () => 'No such report',
    unexpected: (e) => (e.code === 'CLIENT_CLOSED_REQUEST' ? null : e.message), // a timeout lands here too
  });
```

- ✅ Nothing to build; the web-standard API
- ❌ A timeout and a cancel can't be told apart: both arrive with the same message and no `cause`

### B) A signal that aborts with a `TimeoutError` fails the call with `TIMEOUT`

No new option. When the call's `signal.reason` is a `TimeoutError` (what `AbortSignal.timeout()` aborts with), the links fail it with `TIMEOUT`; any other abort stays `CLIENT_CLOSED_REQUEST`.

```ts twoslash
// @errors: 2322
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { z } from 'zod';
import { t } from './server.ts';
const router = {
  report: {
    build: t.procedure
      .input(z.object({ id: z.string() }))
      .query(() => ({ url: '/reports/1.pdf' })),
  },
};
const client = createTrpcClient({
  router: routerType<typeof router>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});
const offline = {
  NETWORK_ERROR: () => 'You are offline',
  BAD_RESPONSE: () => 'Try again later',
};
declare const id: string;
declare const signal: AbortSignal;
// ---cut-end---
const [, err] = await safe(
  client.report.build.query({ id }, { signal: AbortSignal.timeout(60_000) }),
);
if (err)
  matchError(err, {
    ...offline,
    BAD_REQUEST: () => 'No such report',
    unexpected: (e) =>
      e.code === 'TIMEOUT'
        ? 'That took too long'
        : e.code === 'CLIENT_CLOSED_REQUEST'
          ? null
          : e.message,
  });

// Doesn't compile: TIMEOUT stays a built-in code no link declares, so it has no key
if (err)
  matchError(err, {
    ...offline,
    BAD_REQUEST: () => 'No such report',
    TIMEOUT: () => 'That took too long',
    unexpected: (e) => e.message,
  });

// a timeout plus the component's own cancel
client.report.build.query(
  { id },
  { signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) },
);
```

- ✅ The smallest change that tells a timeout from a cancel, with the API people already use
- ✅ Small: the call's `signal.reason` is read where an aborted call becomes its error (`clientErrorFromCause`, and the few links that make `CLIENT_CLOSED_REQUEST` themselves)
- ✅ A `timeout` option (C) can still come later on top of it
- ❌ No client-wide default, and it keys off the abort reason's `name`

### C) B, plus a `timeout` call option and client default

`timeout` takes a `Duration.Input`, as every time option does, and runs as `Effect.timeoutOrElse` around the whole link chain, so it covers retries.

```ts twoslash
// ---cut-start---
import { httpLink, routerType, safe } from '@trpc12/trpc/client';
import { z } from 'zod';
import { createTrpcClientC as createTrpcClient } from '../open/client-timeout-error.ts';
import { t } from './server.ts';
const router = {
  report: {
    build: t.procedure
      .input(z.object({ id: z.string() }))
      .query(() => ({ url: '/reports/1.pdf' })),
  },
};
type AppRouter = typeof router;
declare const url: string;
declare const id: string;
// ---cut-end---
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url })],
  timeout: '10 seconds',
});
const [, err] = await safe(
  client.report.build.query({ id }, { timeout: '60 seconds' }),
);
// err.code === 'TIMEOUT': "Timed out after 60 seconds"
```

- ✅ One setting covers every link (HTTP, WebSocket, local), and a client-wide default `AbortSignal.timeout()` can't give
- ❌ A second way to stop a call next to `signal`, so the docs must say which wins
- ❌ New public surface: v11 has nothing like it, and oRPC's `TimeoutLinkPlugin` only aborts

## Recommendation

**B.** It keeps a timeout out of the "cancelled, do nothing" branch with no new API, and a call option can build on it. Effect client users already have `Effect.timeout` around a call ([effect-native-by-default](../decisions/effect-native-by-default.md)); C would be the Promise client's equivalent, which can wait for someone to ask.

## Blocked until answered

- Nothing. The built-in code table in the client errors docs would add the client-side `TIMEOUT` case with B or C.

## Details

- Checked on `v12` against an `httpLink` server that never answers: `AbortSignal.timeout(100)` and `controller.abort()` both fail with `CLIENT_CLOSED_REQUEST`, "The request was aborted", `cause` undefined. The call is interrupted, so `clientErrorFromCause` makes the error, not `toHttpError`.
- `offline` in the examples is the object of link-code handlers (`NETWORK_ERROR`, `BAD_RESPONSE`) the client errors docs spread into each `matchError()`.
- `TIMEOUT` stays out of `LinkErrorCode`, since a server's 408 sends it too ([link-errors](../decisions/link-errors.md)): it reaches `matchError()`'s `unexpected`, as `CLIENT_CLOSED_REQUEST` does, with no new required key.
- Its status stays 408, so `retryLink`'s default (`serverFailure`: a 5xx or status 0) doesn't retry it. With B the signal has already aborted the whole call anyway.
- Where aborts become `CLIENT_CLOSED_REQUEST` today: `toHttpError` (`http/transport.ts`, a fetch `AbortError`), `clientErrorFromCause` (`link.ts`, an interrupt-only cause), the socket links (`socket.ts`) and `basic.ts`.
