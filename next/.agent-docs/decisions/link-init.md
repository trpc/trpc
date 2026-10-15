# Per-call fetch init, merged onto a link default (human)

- Alex, 2026-10-15 (issues review Q9, #4184): "B I think but think there's more nuance here", then "C sounds good and that you can set a default that this is merged onto, should probably be a callback?".
  - B: `httpLink({ fetch })` gets no third argument with the operations.
  - C: an `init` call option, typed as `RequestInit` plus Next's `next: { revalidate, tags }`, merged onto a default from `httpLink({ init: ({ ops }) => RequestInit })`.
- (agent) The callback runs once per HTTP request. The merge is shallow, except `headers` and `next`, which merge one level deeper. A call whose `init` differs from the rest of the batch leaves the batch.
- Why: SSR cookie forwarding and Next's data cache need per-request fetch options, and a callback sees which operations a request carries.
- Lost: a custom `fetch` that inspects operations; use the `init` callback or a link.
- Lives in: `packages/trpcdev/src/client/links/http.ts`.
