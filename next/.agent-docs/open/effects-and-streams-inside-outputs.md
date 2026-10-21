---
title: Should an `Effect` or `Stream` nested inside a procedure's output stream like a promise or async iterable?
summary: A `Stream` or `Effect` inside an output object arrives today as its internal fields; it could stream like a nested iterable or promise, or be refused.
area: effect
recommended: B
links:
  - kind: decision
    label: nested-deferred-values-kept
    url: ../decisions/nested-deferred-values-kept.md
  - kind: decision
    label: effect-first-public-apis
    url: ../decisions/effect-first-public-apis.md
  - kind: docs
    label: Streaming
    url: https://v12.trpc.io/v12/docs/server/streaming
  - kind: code
    label: Deserialized (output types on the client)
    url: ../../packages/trpc/src/internal/types.ts
  - kind: code
    label: callProcedure's finish (top-level Stream outputs)
    url: ../../packages/trpc/src/server/execution/execute.ts
---

# Should an `Effect` or `Stream` nested inside a procedure's output stream like a promise or async iterable?

## Why it matters

A resolver may return a `Stream` at the top, and the client gets an `AsyncIterable`. Promises and async iterables nested in an output also stream. But a `Stream` or `Effect` nested in an output object is neither: today it is sent as its fields, so the client gets `{ channel: {} }` for a `Stream` and `{ _id: 'Exit', … }` for `Effect.succeed(42)`, with a junk type to match. Nothing errors. The v11 interop handler and the durable middleware already treat nested `Effect`s and `Stream`s as deferred values; the v12 handler doesn't.

## Options

### A) Keep it as it is: convert before returning

Nested values must be promises or async iterables. An Effect user converts them by hand, outside the call's services and interruption.

```ts twoslash
// ---cut-start---
import { Effect, Stream } from 'effect';
import { t, type Post } from './server.ts';
declare const posts: Post[];
declare const countPosts: Effect.Effect<number>;
// ---cut-end---
const feed = t.procedure.query(() => ({
  title: 'Feed',
  // before: arrives as { channel: {} }
  // items: Stream.fromIterable(posts),
  items: Stream.toAsyncIterable(Stream.fromIterable(posts)),
  total: Effect.runPromise(countPosts),
}));
```

- ✅ No change to the serializers or to the output types
- ❌ The mistake is silent: wrong data and a wrong type, no error
- ❌ The converted values run outside the call: no services from the handler's `layer`, no interruption when the client leaves

### B) Let them through as deferred values

A nested `Stream` streams like a nested async iterable, and a nested `Effect` settles like a nested promise. Both run in the call's fiber, with its services and signal. The client types them as `AsyncIterable` and `Promise`.

```ts twoslash
// ---cut-start---
import { Effect, Stream } from 'effect';
import type { ClientOutputB } from '../open/effects-and-streams-inside-outputs.ts';
import { t, type Post } from './server.ts';
declare const posts: Post[];
declare const countPosts: Effect.Effect<number>;
declare function render(post: Post): void;
// ---cut-end---
const feed = t.procedure.query(() => ({
  title: 'Feed',
  items: Stream.fromIterable(posts),
  total: countPosts, // an Effect
}));
// ---cut-start---
declare const client: {
  feed: { query: () => Promise<ClientOutputB<typeof feed>> };
};
// ---cut-end---

// client
const { title, items, total } = await client.feed.query();
//              ^?
for await (const post of items) render(post);
console.log(await total);
```

- ✅ The same rule at any depth as at the top, where a returned `Stream` already streams
- ✅ Matches what the v11 interop handler and the durable middleware already do
- ✅ Nested values get the call's services and stop when the client leaves
- ❌ `Deserialized` (and `JsonOf` for framed serializers) gains two branches. Their cost is measured on every output with `pnpm bench shapes`.
- ❌ A nested value's errors and services aren't inferred into the procedure's, as nested streams aren't validated today. A nested `Effect` that needs a service the router doesn't provide fails at runtime.

### C) Refuse them

A nested `Effect` or `Stream` fails the call with an `INTERNAL_SERVER_ERROR` that names its path and says to return it at the top or convert it.

```ts twoslash
// ---cut-start---
import { Stream } from 'effect';
import { t, type Post } from './server.ts';
declare const posts: Post[];
// ---cut-end---
const feed = t.procedure.query(() => ({
  items: Stream.fromIterable(posts),
}));
// the call fails: "An Effect Stream at output.items; return it as the output, or use Stream.toAsyncIterable"
```

- ✅ The silent wrong value becomes a clear error
- ✅ No new output types
- ❌ Something Effect users will reach for keeps not working
- ❌ A type-level check would touch procedure declaration and cost instantiations on every output; a runtime check only shows up when the call runs

## Recommendation

**B.** A `Stream` already streams at the top of an output, and promises and iterables stream at any depth, so an Effect user expects the same one level down ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)). Promise users write nothing new, so router and procedure declaration stay Effect-free ([`effect-first-public-apis.md`](../decisions/effect-first-public-apis.md)). The type cost is measured before landing.

## Blocked until answered

- Nothing is blocked. The streaming docs don't mention nested `Effect`s or `Stream`s yet.

## Details

- Measured on `v12` with a fetch handler and `httpLink`: `{ items: Stream.make(1, 2, 3) }` arrives as `{ items: { channel: {} } }`, and `{ later: Effect.succeed(42) }` as `{ later: { _id: 'Exit', _tag: 'Success', value: 42 } }`. A nested async generator streams `[1, 2]`.
- The v11 interop handler (`interop/handler/jsonl.ts`) and `middleware/durable.ts` detect nested `Effect`s and `Stream`s as deferred.
- With B, danSON and the framed serializers (`jsonTransformer`, `createSyncSerializer`) find nested values in the same single pass as today ([`nested-deferred-values-kept.md`](../decisions/nested-deferred-values-kept.md)). The work is turning each one into its deferred form in the call's fiber.
