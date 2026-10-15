# Six examples: the proposed five plus Cloudflare (human)

- Alex, 2026-10-15 (decisions round 3, Q16 = proposal 22 Q22.4): "B".
- `next/examples/`:
  - `minimal/`: Node HTTP server and client, plain Promise code (exists).
  - `effect/`: Effect server and client (layers, `Stream`, `catchTag`).
  - `next-app/`: Next.js with TanStack Query, streamed mutations and files.
  - `openapi/`: `.route()`, the generated document and a REST call.
  - `realtime/`: WebSockets with a Redis-backed Publisher and `tracked()` resume.
  - `cloudflare/`: a Worker with a hibernating Durable Object via `trpcdev/cloudflare`.
- (agent) Each depends on `trpcdev: workspace:*` and runs in CI with a typecheck and a smoke run, like `pnpm example` does for `minimal` today.
- Why: one example per distinct runtime or feature; docs snippets already come from tested code.
- Lost: a plain React single-page-app example (`react-vite`); `next-app` covers TanStack Query.
- Lives in: `next/examples/` (only `minimal/` built).
