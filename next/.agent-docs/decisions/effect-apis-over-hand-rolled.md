# Use Effect's APIs, not hand-rolled copies of them, even where they cost bytes (human asked)

- Human, 2026-10-18: "reimplementing effect internals seems dumb no matter the reason, so get rid of that, that's the wrong optimisation". Earlier the same day, on the budget: "Bundle sizing should be focused on minimum tree shaken stuff" ([`orpc-v2-parity.md`](./orpc-v2-parity.md)).
- (agent) Where @trpc12/trpc had a smaller copy of an Effect API, it now calls the API. The copies were cuts for the client budget (2026-10-16), except the server's base64:
  - Trace headers: `HttpTraceContext.toHeaders` from `effect/http`, spread into the plain record `op.trace` is (was a copy of it).
  - The Effect client's `trpc.<path>` span: `Stream.withSpan`, with `Effect.annotateCurrentSpan` for `trpc.error.code` (was `Effect.makeSpanScoped` and `Stream.provideService(Tracer.ParentSpan)`). Still opened only when a tracer is installed ([`tracing-across-client-and-server.md`](./tracing-across-client-and-server.md)).
  - Sequential loops over effects in `httpLink` and danSON's streams: `Effect.forEach` (was `forEachSeq`).
  - Async iterables (subscriptions, danSON's `AsyncIterable`s, OpenAPI's SSE body): `Stream.toAsyncIterable`. `toAsyncIterable(stream, signal)` in `internal/effects.ts` stays only to return the iterator when `signal` aborts, which `Stream.toAsyncIterable` can't take.
  - danSON's deferred `ReadableStream`s: `Stream.toReadableStream`, with `highWaterMark: 0`. It runs ahead of the reader, and erroring a `ReadableStream` drops what's queued, so with a queue an item sent before a failure was lost.
  - Base64: `Base64` from `effect/encoding` for danSON's file bytes over JSON, Lambda bodies and durable input fingerprints (were `btoa`/`atob` loops).
  - `httpLink`'s batching: `Effect.request` with a `RequestResolver` whose key is the call's type and `init`, a `sleep(0)` delay and `maxItems` as its cutoff (was a queue per type, flushed after a macrotask, grouped and sliced by hand, with a settled flag per call). Effect drops a call aborted before its batch is sent; one aborted after still marks itself, and the request aborts once every call in it has settled or been aborted, as before. A full batch is sent as soon as it fills instead of at the end of the tick. +789 B on the minimal client, +803 B on the full one; the ceilings rose to 30.2 and 34.2 kB ([`orpc-v2-parity.md`](./orpc-v2-parity.md)).
- (agent) The budget ceilings rose to today's sizes plus 0.1 kB, as for the last raise: 29.4 kB (minimal) and 33.4 kB (full), from 26.0 and 29.4. Gzipped bytes, minimal / full, measured with the budget's bundler after each change:

  | change                    | minimal |   full |
  | ------------------------- | ------: | -----: |
  | before                    |  25,959 | 29,388 |
  | `HttpTraceContext`        |      +0 |     +0 |
  | `Stream.withSpan`         |      +0 |     +0 |
  | `Effect.forEach`          |    +690 |   +691 |
  | `Stream.toAsyncIterable`  |  +2,167 | +2,154 |
  | `Stream.toReadableStream` |    +438 |   +446 |
  | `Base64`                  |      +0 |   +569 |
  | after                     |  29,254 | 33,248 |

  The Promise client doesn't bundle the client span, so the first two only grow the Effect client (`createEffectClient` with `httpLink`): 27,453 to 28,506 B. `Stream.toAsyncIterable` is the big one: it reports a failure while closing through `Effect.logError`, which brings Effect's logger into the bundle.

- Why: the copies drifted from Effect (the iterator dropped close failures Effect logs; the base64 decoder took input Effect's rejects) and needed their own tests against Effect. Effect fixes and speedups now reach tRPC with the version bump, and apps that already use these APIs bundle them once.
- Lost: 3.3 kB gzipped on the minimal client and 3.9 kB on the full one; each is that much further from its target (18 and 25 kB). Malformed base64 is now judged by Effect: CR/LF inside it is skipped and other whitespace rejected, where `atob` skipped all whitespace and took unpadded Lambda bodies. Lambda always pads, and only forged danSON streams carry anything else.
- Open: kept, since Effect has no API with the same behaviour:
  - `retryLink` and `experimental_durableLink` retry with `Stream.catch` and `Effect.sleep`. `Stream.retry` resets its schedule after the first element, so a stream failing after each element would retry forever where `retries` caps it now, and their `delayMs(attempt, error)` and `retry({ op, error, attempt })` options are public.
  - `httpLink`'s SSE and `wsLink`'s reconnect loops reset their attempt count on a heard event and resume with `lastEventId`.
  - `experimental_memoryLocker`'s per-key queue: a `ttl` releases another holder's lock by token, which `Semaphore` permits can't do. `experimental_redisLocker` polls Redis with `SET NX` until a deadline.
  - `deepEqual` in `client/links/equal.ts` belongs to `dedupeLink` ([`dedupe-link.md`](./dedupe-link.md)).
  - The Promise client runs its links with `runLinks`, skipping the span code that never runs on Effect's native tracer. That leaves out code instead of copying it.
- Lives in: `packages/trpc/src/client/link.ts` (`runOperation`), `src/internal/effects.ts` (`toAsyncIterable`), `src/client/links/http.ts`, `src/serializer/danson/stream.ts`, `src/internal/frames.ts` (`JsonBytes`), `src/aws-lambda/index.ts`, `src/middleware/durable.ts`, `tooling/bench/bench.ts` (`budgets`), `.agent-docs/notes/benchmarks.md` (Budgets).
