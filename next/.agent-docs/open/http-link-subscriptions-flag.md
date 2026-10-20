---
title: 'Should `httpLink({ subscriptions: someBoolean })` keep `.subscribe()` on the client?'
summary: A non-literal `subscriptions` keeps `.subscribe()`, where a non-literal `batch` counts as on; keep the asymmetry and record it?
area: client
recommended: A
links:
  - kind: docs
    label: httpLink options
    url: https://v12.trpc.io/v12/docs/client/links/http
  - kind: decision
    label: one-http-link
    url: ../decisions/one-http-link.md
  - kind: code
    label: HttpLinkDecl
    url: ../../packages/trpc/src/client/links/http/link.ts
---

# Should `httpLink({ subscriptions: someBoolean })` keep `.subscribe()` on the client?

## Why it matters

`httpLink({ subscriptions: false })` removes `.subscribe()` from the client's procedures. Only the literal `false` does: a `boolean` variable keeps `.subscribe()`, and when it's `false` at runtime the call fails with `METHOD_NOT_SUPPORTED`, "This httpLink has subscriptions turned off". `batch` is typed the other way since `15e54ee88`: a `boolean` counts as on, because the strict side is the safe one there. This asks whether the difference is intended.

## Options

### A) Keep it lenient, and record it as a decision

A `subscriptions` that may be on keeps `.subscribe()`.

```ts twoslash
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { t } from './server.ts';
const router = {
  onSeat: t.procedure.subscription(async function* () {
    yield { seat: 'A1' };
  }),
};
type AppRouter = typeof router;
declare const url: string;
declare const env: { SSE_ENABLED: boolean };
// ---cut-end---
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url, subscriptions: env.SSE_ENABLED })], // boolean
});

for await (const event of client.onSeat.subscribe()) {
} // compiles
// when SSE_ENABLED is false: METHOD_NOT_SUPPORTED at runtime
```

- ✅ A flag read from config doesn't remove a method the app calls when it's on
- ✅ Each option takes the side where a mistake costs least: a batched `Response` call always fails, a subscription only when the flag is off
- ❌ Not what `batch: boolean` does, so the two options read differently

### B) Strict, like `batch`: only a literal `true` (or no option) keeps `.subscribe()`

A `subscriptions` that may be off removes `.subscribe()`.

```ts twoslash
// @errors: 2339
// ---cut-start---
import { createTrpcClient, routerType } from '@trpc12/trpc/client';
import { httpLinkB as httpLink } from '../open/http-link-subscriptions-flag.ts';
import { t } from './server.ts';
const router = {
  onSeat: t.procedure.subscription(async function* () {
    yield { seat: 'A1' };
  }),
};
type AppRouter = typeof router;
declare const url: string;
declare const env: { SSE_ENABLED: boolean };
// ---cut-end---
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url, subscriptions: env.SSE_ENABLED })],
});
// Doesn't compile: a `subscriptions` that may be off removes `.subscribe()`
client.onSeat.subscribe(); // ❌ NoLinkCarries<"subscription">

// an app with a runtime flag picks the link instead
const flagged = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [
    env.SSE_ENABLED
      ? httpLink({ url })
      : httpLink({ url, subscriptions: false }),
  ],
});
// the union of the two chains has no `.subscribe()` either
flagged.onSeat;
//      ^?
```

- ✅ One rule for both options: a value that may turn something off turns it off in the types
- ❌ Apps with a runtime flag lose `.subscribe()` they do use, and have to restructure the chain (and the conditional above types as a union of two chains)

## Recommendation

**A.** The two options guard different failures: a batched `Response` call fails every time, so the types assume the worst, while a subscription behind a runtime flag works whenever the flag is on. Recording it as a decision makes the asymmetry intended rather than accidental.

## Blocked until answered

- Nothing; A adds a decision bullet to `one-http-link.md`, and the `httpLink` docs say a `boolean` keeps `.subscribe()`.

## Details

- The check is `TOpts extends { subscriptions: false }` in `HttpLinkDecl`; `batch` is `[Exclude<TOpts['batch'], undefined>] extends [false]`.
- Related: [`response-batch-false-message.md`](./response-batch-false-message.md), for the `batch` side.
- From the first-release review, question 14, recommended there as A.
