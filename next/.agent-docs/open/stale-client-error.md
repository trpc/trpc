---
title: Should a client built against a newer router get a distinct error when it calls a procedure the server doesn't have?
summary: A stale deploy's missing procedure arrives as a plain `NOT_FOUND`, like a missing record; a client-side `STALE_CLIENT` code could say so.
area: errors
recommended: A
questions: [Q24.7]
links:
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
  - kind: decision
    label: error-ownership
    url: ../decisions/error-ownership.md
  - kind: decision
    label: error-tags
    url: ../decisions/error-tags.md
  - kind: note
    label: closed-error-unions (census)
    url: ../notes/closed-error-unions.md
  - kind: code
    label: protocolError for unknown paths (call.ts)
    url: ../../packages/trpc/src/server/handler/call.ts
  - kind: code
    label: fromWireError (error.ts)
    url: ../../packages/trpc/src/internal/error.ts
---

# Should a client built against a newer router get a distinct error when it calls a procedure the server doesn't have?

## Why it matters

When a new client reaches an old server (a deploy in progress, a cached bundle), the server answers the unknown path with `NOT_FOUND`, `No procedure at path "doc.archive"`. On the client it's a `defined: false` `NOT_FOUND`, told apart from a thrown `NOT_FOUND` only by its `message`, and `matchError()` sends it to `unexpected`. Nothing says "reload, you're out of date". Not spiked; proposal 24 recommends "later".

## Options

### A) Keep it as it is, for now

A missing procedure stays a built-in `NOT_FOUND`.

```ts
matchError(err, {
  ...offline,
  unexpected: (e) =>
    e.code === 'NOT_FOUND' && e.message.startsWith('No procedure at path')
      ? promptReload()
      : e.message,
});
```

- ✅ No new code, header or wire field
- ❌ A stale deploy looks like a missing record unless the app matches on `message`

### B) A distinct error for unknown paths

The server sends `NOT_FOUND` with `data: { procedure: path }`, and the client turns it into a new client-side built-in code, `STALE_CLIENT` (status 0, like `BAD_RESPONSE`).

```ts
// wire: { error: { code: 'NOT_FOUND', message: 'No procedure at path "doc.archive"',
//                  data: { procedure: 'doc.archive' } } }
matchError(err, {
  ...offline,
  unexpected: (e) => (e.code === 'STALE_CLIENT' ? promptReload() : e.message),
});
```

- ✅ Small: no header and no hash; v11 clients and OpenAPI callers still see a plain `NOT_FOUND`
- ❌ Also fires for a typo in an untyped client's path
- ❌ A thrown `NOT_FOUND` with that `data` shape would be misread unless the key is reserved

### C) A router fingerprint

The client sends a hash of the router's paths and types in a `trpc-router` header; a server whose hash differs answers unknown paths with `STALE_CLIENT`.

```ts
// every request: trpc-router: 9f2c…
matchError(err, {
  ...offline,
  unexpected: (e) => (e.code === 'STALE_CLIENT' ? promptReload() : e.message),
});
```

- ✅ Knows the cause for certain, and could later flag a changed type on a path that still exists
- ❌ A types-only client (`routerType<AppRouter>()`) has no router at runtime, so the hash needs a build step or a contract
- ❌ A custom header on every request forces a CORS preflight, which tRPC avoids today

## Recommendation

**A.** It's independent of the rest of proposal 24 and hasn't been spiked. When it comes back, B is the cheaper path: no header, and nothing changes for v11 or OpenAPI callers.

## Blocked until answered

- Nothing.

## Details

- Built-in errors lose their `data` on the client today: `fromWireError` folds every undefined built-in error through `toUntypedError` ([closed-client-errors](../decisions/closed-client-errors.md)). B would read `data.procedure` before that fold, or the folding would keep it for this one shape.
- Unknown paths are answered in `server/handler/call.ts` and `batch.ts`, `server/sockets/socket.ts`, and `localLink` (`client/links/local.ts`); the v11 interop handler says `No procedure found on path`.
- A second discriminator inside `NOT_FOUND` (a `reason`) is the other way to do this, and needs a call against [error-tags](../decisions/error-tags.md) (`_tag` is the code); the `reason` question in [granular-errors](../decisions/granular-errors.md) covers it.
- `offline` in the examples is the object of link-code handlers (`NETWORK_ERROR`, `BAD_RESPONSE`) the client errors docs spread into each `matchError()`.
