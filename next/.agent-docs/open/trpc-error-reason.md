---
title: Should tRPC's own errors carry a tagged `reason` inside their code?
summary: A missing procedure and a body too large are just `NOT_FOUND` and `PAYLOAD_TOO_LARGE` plus a message; a typed `reason` would say which failure it was.
area: errors
recommended: A
links:
  - kind: pr
    label: 'PR #7677 (closed)'
    url: https://github.com/trpc/trpc/pull/7677
  - kind: decision
    label: granular-errors
    url: ../decisions/granular-errors.md
  - kind: decision
    label: error-tags
    url: ../decisions/error-tags.md
  - kind: docs
    label: Server errors
    url: https://v12.trpc.io/v12/docs/server/errors
  - kind: code
    label: TrpcError and its classes (error.ts)
    url: ../../packages/trpc/src/internal/error.ts
---

# Should tRPC's own errors carry a tagged `reason` inside their code?

## Why it matters

The human asked: "We should probably be more specific with trpc errors too so we just don't use a blanket one everywhere". What landed is a class per built-in code (`TrpcError.NotFound`, `TrpcError.PayloadTooLarge`, …, 25 of them) and exact error types on internal Effects. Inside one code, the failures tRPC makes still differ only by `message`: `NOT_FOUND` is a missing procedure or a thrown "no such post", and `PARSE_ERROR` is bad JSON, a bad multipart body or an undecodable input. Code in `onError` or a link that wants to react to one of them matches on the message. [#7677](https://github.com/trpc/trpc/pull/7677) built a typed `reason` for this, before the classes landed, and was closed unported.

## Options

### A) Keep codes, classes and messages

A failure tRPC makes is its code's class with a fixed message and, where there is one, a `cause`.

```ts
createFetchHandler({
  router,
  onError: ({ error }) => {
    if (error.code === 'PAYLOAD_TOO_LARGE') metrics.count('body-too-large');
    if (
      error.code === 'NOT_FOUND' &&
      error.message.startsWith('No procedure at path')
    ) {
      log.warn('stale client?', error.message);
    }
  },
});
```

- ✅ Built; one discriminator (`code`, which is also `_tag`) and nothing more to learn
- ✅ No bundle or type cost; the client bundle is already over its target
- ❌ Telling failures inside one code apart means matching message strings

### B) Port #7677: an optional, never-serialized `TrpcError.reason`

A closed `Data.TaggedEnum` of about 60 failures (`BodyTooLarge { limit }`, `ProcedureNotFound { path }`, `InvalidJson`, `FetchFailed`, `SerializerMismatch { server, client, transport }`, …), each fixing its code and message, as Effect's `HttpServerError` and `AiError` carry a `reason`.

```ts
import { Predicate } from 'effect';

createFetchHandler({
  router,
  onError: ({ error }) => {
    if (Predicate.isTagged(error.reason, 'BodyTooLarge')) {
      log.warn(`a body went over ${error.reason.limit} bytes`);
    }
    if (Predicate.isTagged(error.reason, 'ProcedureNotFound')) {
      log.warn('stale client?', error.reason.path);
    }
  },
});
```

- ✅ Effect's own shape for "one error, which failure"; internals' channels narrow on it with `Effect.catchTag`/`catchReason`
- ✅ One table owns every built-in message, replacing copied strings
- ❌ It stays on the side that made it: a client never sees the server's `ProcedureNotFound`, only reasons its own links made
- ❌ About 60 public names to keep through 1.0, and the reason tables in the client bundle; #7677 touched files that have been rewritten since

### C) A short list of serialized reasons

Only the few reasons a client can act on (a missing procedure, a body too large) go on the wire, as a `reason` field next to `code`.

```ts
matchError(err, {
  ...offline,
  unexpected: (e) =>
    e.reason === 'ProcedureNotFound' ? promptReload() : e.message,
});
```

- ✅ Reaches the client, where a stale deploy needs handling
- ❌ A wire format change, and a second discriminator next to `_tag`, against `error-tags.md`
- ❌ Overlaps the stale-client question ([`stale-client-error.md`](./stale-client-error.md))

## Recommendation

**A** for 0.1. The classes answer most of the ask, and B is additive (an optional field nobody has to read), so it can land later without breaking anyone, in Effect's shape, if users want to tell failures apart in `onError`. C belongs with the stale-client question.

## Blocked until answered

- Nothing. B would replace the message strings in handlers, links, OpenAPI and the Cloudflare token check with reason constructors, and document `reason` in `server/errors.md`.

## Details

- #7677's commit is `d2e1cbbbd` (`internal/failure.ts`, `failure(Reason.X(…), cause?)`, `TrpcError<'PAYLOAD_TOO_LARGE'> & { reason: BodyTooLarge }`). It left errors rebuilt from the wire or a store, declared and input-validation errors, the masked internal error and the v11 interop handler without a reason.
- It also carried a `trpc/no-throw-in-effect` lint rule, a separate change.
- [`effect-catch-tag-built-in-errors.md`](./effect-catch-tag-built-in-errors.md) is about `catchTag` catching the built-in `NOT_FOUND`; a serialized reason (C) would be another way to tell it apart.
