# Six examples: the proposed five plus Cloudflare (human)

- Human, 2026-10-15 (decisions round 3, Q16 = proposal 22 Q22.4): "B".
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
- (agent) Built: `pnpm example` runs each example's `smoke` script in CI. `cloudflare/` runs on workerd through Wrangler's `unstable_startWorker`, and on Cloudflare itself once deployed ([`deployed-cloudflare-examples.md`](./deployed-cloudflare-examples.md)). `realtime/` runs two servers against a real Redis (a CI service). `next-app/` runs `next build` and `next start`, then checks the server-rendered page and calls the route with a Node client.
- (agent) What the `next-app` smoke found: RSC refused the serializer's null-prototype objects, so `serialize` now emits plain objects; batches POST to the bare endpoint, so the Next route is `app/api/trpc/[[...trpc]]/route.ts`.
- Lives in: `next/examples/{minimal,effect,next-app,openapi,realtime,cloudflare}/`, root `pnpm example`, `.github/workflows/next.yml`.
