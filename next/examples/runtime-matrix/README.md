# Runtime matrix example

One router ([`src/router.ts`](./src/router.ts)) served on every runtime the [adapters](../../docs/adapters/overview.md) cover, and one set of client checks ([`checks.ts`](./checks.ts)) run against each. `pnpm smoke` starts every runtime, runs the checks and prints what each passed:

```
node                 runtime, batch, errors, rich types, files, streaming, sse resume, cors, services, websocket, websocket origin
bun (Bun.serve)      runtime, batch, errors, rich types, files, streaming, sse resume, cors, services
bun (Effect)         runtime, batch, errors, rich types, files, streaming, sse resume, cors, services, websocket, websocket origin
deno                 runtime, batch, errors, rich types, files, streaming, sse resume, cors, services, websocket, websocket origin
lambda (buffered)    runtime, batch, errors, rich types, files, buffered, sse resume, cors, services
lambda (streaming)   runtime, batch, errors, rich types, files, streaming, sse resume, cors, services
lambda (v1 events)   REST API, ALB
workers              runtime, batch, errors, rich types, files, streaming, sse resume, cors, services
```

| Entry point                                | Runtime            | Serves with                                   |
| ------------------------------------------ | ------------------ | --------------------------------------------- |
| [`src/node.ts`](./src/node.ts)             | Node               | `serve(handler)` on `NodeHttpServer`          |
| [`src/bun.ts`](./src/bun.ts)               | Bun                | `Bun.serve({ fetch })`, no WebSockets         |
| [`src/bun-effect.ts`](./src/bun-effect.ts) | Bun                | `serve(handler)` on `BunHttpServer`           |
| [`src/deno.ts`](./src/deno.ts)             | Deno               | `Deno.serve`, `handler.websocket`             |
| [`src/lambda.ts`](./src/lambda.ts)         | AWS Lambda         | `toLambdaHandler`, `toLambdaStreamingHandler` |
| [`src/worker.ts`](./src/worker.ts)         | Cloudflare Workers | `handler.fetch`, visits in KV                 |

Every check calls the runtime over the network with the typed client:

- **runtime**: the call reached that runtime (and on Lambda, `ctx` has the platform argument's `awsRequestId`).
- **batch**: two queries go in one request.
- **errors**: a `NOT_FOUND` with its `data`, through `safe()`.
- **rich types**: a `Date` and a `Map` round-trip, with danSON on both ends.
- **files**: a `File` input as multipart, and a `File` output.
- **streaming**: `countdown` yields one item, then waits for the client's `release` call. A runtime that streams delivers the first item, so the client releases it (`first,released`). A buffered one sends nothing until the wait times out (`first,timed out`), which is what buffered Lambda does.
- **sse resume**: a subscription over SSE resumes after `lastEventId`.
- **cors**: `cors()` answers a preflight for the allowed origin, with the requested `content-type`, and not for another.
- **services**: the `Visits` service comes from the entry point's layer: memory on servers, Workers KV on the Worker.
- **websocket**: queries, a resumed subscription and a streamed output over `wsLink`; **websocket origin**: a cross-origin upgrade is refused.

## Notes per runtime

- **Bun:** `Bun.serve` takes `handler.fetch`, but Bun's server WebSockets aren't web-standard. For WebSockets, `bun-effect.ts` runs `serve(handler)` on `@effect/platform-bun`'s `BunHttpServer`.
- **Deno:**
  - `cors()` wraps `handler.fetch`, but an upgrade passed to `handler.websocket` never goes through it, so `deno.ts` checks the origin itself before `Deno.upgradeWebSocket`.
  - Deno 2.9 prints a notice that `request.signal` also aborts after a successful response (its legacy behavior). Calls are unaffected.
- **Lambda:**
  - [`src/function-url.ts`](./src/function-url.ts) stands in for a function URL: it turns each request into a payload 2.0 event, and in `streaming` mode reads the streaming handler's prelude and forwards the body as it's written, as `InvokeMode: RESPONSE_STREAM` does.
  - `smoke.ts` also calls `main` directly with REST API and ALB (payload 1.0) events.
  - Deploy `src/lambda.ts` as is: outside Lambda, `streaming` is the bare handler, and inside it is wrapped with `awslambda.streamifyResponse`.
- **Workers:** the handler is created once, outside any request, so its `Visits` layer reads the KV binding from `cloudflare:workers`' `env`. WebSockets on Workers need a Durable Object; [`examples/cloudflare`](../cloudflare) has one. `pnpm run deploy` deploys it, and Wrangler provisions the KV namespace.

## Running

From `next/`, `pnpm example` runs every example's smoke, this one included. Bun and Deno must be on `PATH`: outside CI, a runtime that isn't installed is skipped; in CI (`CI` set) it fails.

Here:

- `pnpm smoke` runs the matrix.
- `pnpm start:node`, `start:bun`, `start:deno` or `start:lambda` serves one runtime on `PORT` (default 3000).
- `pnpm dev:worker` runs the Worker with Wrangler.

`pnpm typecheck` checks each runtime's files with its own types (`tsconfig.json` for Node, Lambda and the checks, then `tsconfig.bun.json`, `tsconfig.deno.json` and `tsconfig.worker.json`). Deno's globals come from the small [`src/deno-globals.d.ts`](./src/deno-globals.d.ts), so this needs no Deno install; `deno check src/deno.ts` checks it against Deno's own types.
