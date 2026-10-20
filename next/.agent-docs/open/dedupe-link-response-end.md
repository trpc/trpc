---
title: Should links learn when a response's body ends, so aborting a deduped query stops the streams in its output?
summary: With `dedupeLink`, aborting a query's signal after its value no longer stops a stream in that value; fixing it needs a body-end signal across links.
area: client
recommended: A
links:
  - kind: decision
    label: dedupe-link
    url: ../decisions/dedupe-link.md
  - kind: docs
    label: dedupeLink
    url: https://v12.trpc.io/v12/docs/client/links/dedupe
  - kind: code
    label: dedupeLink
    url: ../../packages/trpc/src/client/links/dedupe.ts
  - kind: code
    label: Operation and EffectLinkOpts
    url: ../../packages/trpc/src/client/link.ts
---

# Should links learn when a response's body ends, so aborting a deduped query stops the streams in its output?

## Why it matters

`dedupeLink` aborts a shared request's signal once every caller still in it has aborted. A query's caller leaves at its value, so aborting its signal afterwards doesn't reach the request, and a stream inside that value keeps going. Measured with `httpLink` and an output of 50 streamed items, aborting after the third: 3 items and `CLIENT_CLOSED_REQUEST` without `dedupeLink`, all 50 with it. Keeping each caller's abort listener until the signal aborts would fix that but leak on long-lived signals, which is the bug the second pass fixed. Today's behaviour is documented.

## Options

### A) Keep it as it is, documented

A query's caller stops a stream in its result by no longer reading it, or sends the call on its own with `dedupe: false`. Subscriptions are unaffected: their callers count while they read.

```ts
const ac = new AbortController();
const { items } = await client.feed.query(undefined, { signal: ac.signal });
for await (const item of items) {
  if (enough) break; // stops the stream
}

// or, when aborting must cut the stream:
await client.feed.query(undefined, { signal: ac.signal, dedupe: false });
```

- ✅ No change to links; long-lived signals don't gather listeners
- ✅ Only queries whose output holds a stream are affected
- ❌ `signal` means something different for a deduped query's streams than for every other call

### B) Links report when a response's body ends

The terminating links (`httpLink`, `wsLink`, `localLink`, the socket links) tell the chain when a response's body has been read to its end, deferred values included. `dedupeLink` keeps each query caller counted until then, so aborting stops the streams, and drops its listener at the body's end.

```ts
// app code is unchanged, and the abort now stops the stream with dedupeLink too
const ac = new AbortController();
const { items } = await client.feed.query(undefined, { signal: ac.signal });
ac.abort(); // items fails with CLIENT_CLOSED_REQUEST

// a custom terminating link reports its body's end (shape to settle, e.g. a Scope on the operation)
```

- ✅ `signal` behaves the same with and without `dedupeLink`
- ✅ The same signal could serve other links that hold something until a body is read
- ❌ A change across every terminating link, and custom ones must report the end or the listener stays until the body is collected
- ❌ A body that's never read to its end keeps its callers' listeners as long as the body stays open

## Recommendation

**A.** The case is narrow (a deduped query, a stream in its output, an abort after the value), it's documented, and both workarounds are one line. B changes the contract of every terminating link for it. If more links come to need a body's end, B is the shape to build.

## Blocked until answered

- Nothing is blocked; the `dedupeLink` docs describe A.

## Details

- Rejected along the way ([`dedupe-link.md`](../decisions/dedupe-link.md)):
  - A `WeakRef` with a `FinalizationRegistry` depends on the garbage collector, and listeners still gather on a long-lived signal.
  - A per-caller view of each stream would break today's "one stream for every caller", where the link doesn't look inside a value, and leak for a caller that never reads.
- Related `Open` bullets in the same decision: letting a call join after the first value when it would miss nothing, and copying a stream in a query's output per caller.
