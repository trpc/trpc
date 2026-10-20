# One `httpLink` replaces v11's five HTTP links (human)

- Answers Q17.4 (proposal 17): yes. `httpLink({ url, batch?, subscriptions?, … })` sends single calls, opt-in batches (`batch: batching()`), streamed results (JSONL by negotiation), opt-in SSE subscriptions (`subscriptions: sse()`) and `multipart/form-data` inputs ([`links.md`](./links.md), [`wire-protocol.md`](./wire-protocol.md)).
- (agent) The codemod rewrites `httpBatchLink`, `httpBatchStreamLink`, `httpSubscriptionLink` and `unstable_httpBatchStreamLink` to `httpLink`, adding `batch: batching()` where v11 batched and `subscriptions: sse()` where it subscribed ([`v11-codemod.md`](./v11-codemod.md)).
- Why: the server decides the response format from the output, so the client needn't pick a link per format; one link has one set of options.
- Lost: dropping streaming support from bundles that never stream.
- Human, 2026-10-16 (Q17.4, decision round): "A, make sure it adds some params where you can opt out of batching etc / Might be changed in the future for simple use cases". Each feature can be turned off on the link.
  - (agent) Built, 2026-10-16. Opt-outs on the link: `batch` (off by default), `subscriptions: false` (procedures lose `.subscribe()`), `binary` (off by default) and `reconnect.attempts`. Per call: `{ batch: false }` and `{ reconnect: false }`.
  - Open: there is no way to opt out of streamed results, because the server streams whenever an output holds deferred values. An opt-out would need the server to settle them when the client doesn't accept JSONL.
- Human, 2026-10-19, after the client bundle research ([`client-bundle-anatomy.md`](../notes/client-bundle-anatomy.md)): one PR per cut. This one is "SSE and batching as imports instead of `httpLink` options".
  - (agent) Batching and SSE are imports passed as option values: `batch: batching({ maxItems })` and `subscriptions: sse({ reconnect })`, both from `@trpc12/trpc/client`. Each returns an opaque value whose `build(transport)` makes the feature, so `httpLink` reaches `batch.ts` and `sse.ts` only through what it's given, and a client that passes neither bundles neither. Subscriptions are off by default now (`unsupported: 'subscription'` until `sse()` is passed); `reconnect` moved into `sse()`. Per call, `{ batch: false }` and `{ reconnect: false }` stay.
  - Why option values rather than v11's separate links: one link keeps one set of options and `HttpLinkDecl`'s typing, and the transport (URLs, headers, `init`, responses) is built once and shared.
  - `true` from JavaScript throws a `TypeError` naming the import; `false` leaves the feature out, as before.
  - Lost: SSE by default. A client that subscribes over HTTP adds `subscriptions: sse()`; the types say so (`.subscribe()` is missing without it).
  - Alex, 2026-10-19: "just close those bundle branches and reopen them, they're probably all out of date now anyway". (agent) Re-applied on the Effect-refactored v12 (454a3d1de) rather than replayed. Gzip, `pnpm bench budget`'s bundling: the minimal client 39.8 → 36.6 kB, the full client with `sse()` 44.1 → 42.7 kB. A client passing both `batching()` and `sse()` pays 0.2 kB more for the indirection.
- Tentative (human): "Might be changed in the future for simple use cases". Challenge it when it gets in the way.
- Lives in: `packages/trpc/src/client/links/http/`, `packages/upgrade/src/transform.ts`.
