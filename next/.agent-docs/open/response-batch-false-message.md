---
title: 'Should a `Response` procedure called on a batching `httpLink` without `{ batch: false }` get a clearer type error?'
summary: 'The call fails to compile with "Expected 2 arguments, but got 0", which doesn''t say to pass `{ batch: false }`; a clearer message costs types.'
area: client
recommended: A
links:
  - kind: docs
    label: Responses (unbatched calls)
    url: https://v12.trpc.io/v12/docs/server/responses
  - kind: decision
    label: raw-responses
    url: ../decisions/raw-responses.md
  - kind: code
    label: ProcedureCallArgs (client types)
    url: ../../packages/trpc/src/client/types.ts
  - kind: code
    label: HttpLinkDecl (batches)
    url: ../../packages/trpc/src/client/links/http/link.ts
---

# Should a `Response` procedure called on a batching `httpLink` without `{ batch: false }` get a clearer type error?

## Why it matters

A batch can't carry a raw `Response` (or a root `Blob` without a streaming serializer), so on a chain with `httpLink({ batch: true })` the client's types make `{ batch: false }` a required second argument for procedures that may return one. Leaving it out is caught, but TypeScript reports the arity: "Expected 2 arguments, but got 0". The reason is in the docs (`server/responses.md`) and in the signature help, not in the error.

## Options

### A) Keep it for 0.1

The second argument stays required, typed `opts & { batch: false }`; the docs and the signature say why.

```ts twoslash
// @errors: 2554 2345
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { t } from './server.ts';
const router = {
  report: t.procedure.query(() => new Response('a,b\n1,2')),
};
type AppRouter = typeof router;
declare const url: string;
// ---cut-end---
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url, batch: true })],
});

await client.report.query(); // ❌ Expected 2 arguments, but got 0.
await client.report.query(undefined, {}); // ❌ Property 'batch' is missing in type '{}'
await client.report.query(undefined, { batch: false }); // ✅ sent alone
```

- ✅ Built and tested; the check costs nothing on chains that don't batch, and tests a key before comparing outputs on those that do
- ✅ Hovering the call shows `opts: … & { batch: false }`
- ❌ The first error a user sees doesn't name the fix

### B) A hint in the type

Add a branded key to the required options (as `NoLinkCarries<"subscription">` does for `.subscribe()`), so an options object without `batch` fails with a sentence.

```ts twoslash
// @errors: 2345 2554
// ---cut-start---
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import { t } from './server.ts';
const router = {
  report: t.procedure.query(() => new Response('a,b\n1,2')),
};
type AppRouter = typeof router;
declare const url: string;
import type { BatchHintClientB as BatchHint } from '../open/response-batch-false-message.ts';
const trpc = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url, batch: true })],
});
const client = trpc as BatchHint<typeof trpc>;
// ---cut-end---
await client.report.query(undefined, {});
// ❌ Property 'report may return a Response: pass { batch: false }' is missing …
await client.report.query(); // still: Expected 2 arguments, but got 0.
```

- ✅ The message names the fix once an options object is passed
- ❌ TypeScript reports a missing argument before any type, so the most common mistake keeps the arity message
- ❌ One more type per such procedure on every batching chain, the hot path the `links` bench shape measures

### C) No type check; fail at runtime

Drop the conditional, so calls compile without `{ batch: false }`; the server fails the batched call with `BAD_REQUEST`, `"report" returns a Response, which only an unbatched HTTP call or an in-process call can carry`.

```ts twoslash
// ---cut-start---
import { createTrpcClient, routerType } from '@trpc12/trpc/client';
import { httpLinkC as httpLink } from '../open/response-batch-false-message.ts';
import { t } from './server.ts';
const router = {
  report: t.procedure.query(() => new Response('a,b\n1,2')),
};
type AppRouter = typeof router;
declare const url: string;
const client = createTrpcClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url, batch: true })],
});
// ---cut-end---
await client.report.query(); // compiles; rejects with BAD_REQUEST when batched
await client.report.query(undefined, { batch: false }); // ✅
```

- ✅ A clear message, and fewer types on batching chains
- ❌ The mistake reaches production; `15e54ee88` went the other way for `batch: boolean` for this reason

## Recommendation

**A.** The error is caught at compile time and the signature shows the fix; B doesn't improve the zero-argument case that users actually hit, and C trades the check for a message. Revisit if users report it.

## Blocked until answered

- Nothing.

## Details

- `ProcedureCallArgs` in `client/types.ts` reads `batches` once per chain (`Batches<TLinks>`), then tests the output for a body-like key (`arrayBuffer` or `HttpServerResponse`) before comparing it with `Response` and `Blob`.
- A `batch` that may be on, such as a `boolean` variable, counts as on since `15e54ee88`; [`http-link-subscriptions-flag.md`](./http-link-subscriptions-flag.md) is the opposite choice for `subscriptions`.
- From the first-release review, question 14, recommended there as A.
