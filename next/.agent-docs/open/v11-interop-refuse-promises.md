---
title: Should the v11 interop handler refuse promises on the JSON links with 415, as v11 did?
summary: The interop settles promises in outputs for v11's `httpLink`/`httpBatchLink`; v11 refused them with 415. Match v11 exactly, or keep settling?
area: server
recommended: A
links:
  - kind: decision
    label: v11-stream-cancel-and-interop-parity
    url: ../decisions/v11-stream-cancel-and-interop-parity.md
  - kind: decision
    label: v11-interop-handler
    url: ../decisions/v11-interop-handler.md
  - kind: docs
    label: Serve v11 clients
    url: https://v12.trpc.io/v12/docs/migrations/from-v11/serve-v11-clients
  - kind: code
    label: createV11Handler (settle)
    url: ../../packages/trpc/src/interop/handler/handler.ts
  - kind: code
    label: v11-parity.test.ts (known differences)
    url: ../../packages/trpc/src/interop/handler/v11-parity.test.ts
---

# Should the v11 interop handler refuse promises on the JSON links with 415, as v11 did?

## Why it matters

`createV11Handler` serves a v12 router to `@trpc/client` 11 apps. When a procedure's output holds a promise at the root or a top-level key, v11's own server answered `httpLink` and `httpBatchLink` with `UNSUPPORTED_MEDIA_TYPE` (415), "Cannot use stream-like response in non-streaming request - use httpBatchStreamLink". The interop settles the promises instead and sends the value. The human asked that "response shapes are always the same"; this is one of the differences the parity suite (`v11-parity.test.ts`) keeps on purpose, each with its reason.

## Options

### A) Keep settling promises

The JSON links get the settled value; async iterables still get v11's 415.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
interface Comment {
  id: string;
  body: string;
}
// @trpc/client 11 isn't installed here: a stand-in for its client of this router
declare const client: {
  post: { query(): Promise<{ title: string; comments: Comment[] }> };
};
declare const db: { comments: { list(): Promise<Comment[]> } };
// ---cut-end---
const post = t.procedure.query(() => ({
  title: 'Hello',
  comments: db.comments.list(), // a Promise
}));

// v11 app on httpBatchLink, through createV11Handler
await client.post.query(); // { title: 'Hello', comments: [...] }
// v11's own server: TRPCClientError, UNSUPPORTED_MEDIA_TYPE
```

- ✅ A router shared by old and new clients can return promises, which `httpLink` in v12 streams
- ✅ An app moving to v12 can add deferred values before every v11 client is gone
- ❌ Not v11's exact answer: a call that failed against v11's server succeeds against the interop (no v11 app could use that procedure on a JSON link anyway)

### B) Refuse them with 415, as v11 did

The JSON links get v11's error; only `httpBatchStreamLink` reads deferred values.

```ts twoslash
// ---cut-start---
interface Comment {
  id: string;
  body: string;
}
// @trpc/client 11 isn't installed here: a stand-in for its client of this router
declare const client: {
  post: { query(): Promise<{ title: string; comments: Comment[] }> };
};
// ---cut-end---
// v11 app on httpBatchLink, through createV11Handler
await client.post.query();
// TRPCClientError: Cannot use stream-like response in non-streaming request - use httpBatchStreamLink
// (UNSUPPORTED_MEDIA_TYPE, 415), as from v11's own server
```

- ✅ Byte-for-byte v11, and one row fewer in the parity suite's `known` table
- ❌ A procedure that starts returning a promise for v12 clients breaks every v11 client on a JSON link

### C) An option on `createV11Handler`

Settle by default, or refuse with 415 when asked.

```ts twoslash
// ---cut-start---
import { createV11HandlerC as createV11Handler } from '../open/v11-interop-refuse-promises.ts';
import { appRouter, type Context } from './server.ts';
declare function createContext(): Context;
// ---cut-end---
const legacy = createV11Handler({
  router: appRouter,
  createContext,
  deferred: 'refuse', // 'settle' by default
});
```

- ✅ Exact v11 for apps that need it
- ❌ A stable option for a difference no v11 app should depend on

## Recommendation

**A.** The interop exists so a server can move to v12 while old clients keep working; refusing promises would make adding a deferred value for new clients break old ones, which is the opposite. The difference is already pinned by the parity suite and documented with its reason.

## Blocked until answered

- Nothing.

## Details

- `settle` in `interop/handler/handler.ts` settles the root and top-level-key promises, the ones v11's JSON Lines could carry. Async iterables and `Stream`s fail with v11's 415 on the JSON links.
- The parity suite's `known` rows `httpLink deferred` and `batch deferred` check that the two servers still differ there, so B would drop them.
