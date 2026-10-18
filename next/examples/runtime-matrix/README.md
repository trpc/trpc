# Runtime matrix example

One router ([`src/router.ts`](./src/router.ts)) served on every runtime the [adapters](../../docs/adapters/overview.md) cover, and one client ([`client.ts`](./client.ts)) run against each. `pnpm start` starts every runtime its own way, runs the client against it, and exits:

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

The layout is the [examples'](../README.md) one, once per runtime: the root's `server.ts` is Node's, and each other runtime's directory has its `server.ts` (that runtime's entry) and a `start.ts` that starts it that runtime's way and calls the client's `main(url)`.

| Server                                           | Runtime            | Serves with                                   | Started by                                                       |
| ------------------------------------------------ | ------------------ | --------------------------------------------- | ---------------------------------------------------------------- |
| [`server.ts`](./server.ts)                       | Node               | `serve(handler)` on `NodeHttpServer`          | `listen()`, in the start process                                 |
| [`bun/server.ts`](./bun/server.ts)               | Bun                | `Bun.serve({ fetch })`, no WebSockets         | [`bun/start.ts`](./bun/start.ts): `bun`                          |
| [`bun/effect-server.ts`](./bun/effect-server.ts) | Bun                | `serve(handler)` on `BunHttpServer`           | [`bun/start.ts`](./bun/start.ts): `bun`                          |
| [`deno/server.ts`](./deno/server.ts)             | Deno               | `Deno.serve`, `handler.websocket`             | [`deno/start.ts`](./deno/start.ts): `deno run`                   |
| [`lambda/server.ts`](./lambda/server.ts)         | AWS Lambda         | `toLambdaHandler`, `toLambdaStreamingHandler` | [`lambda/start.ts`](./lambda/start.ts): a local function URL     |
| [`workers/server.ts`](./workers/server.ts)       | Cloudflare Workers | `handler.fetch`, visits in KV                 | [`workers/start.ts`](./workers/start.ts): `unstable_startWorker` |

Every check calls the server over the network with the typed client, and fails the run with `node:assert/strict` on a wrong result:

- **runtime**: the call reached that runtime (and on Lambda, `ctx` has the platform argument's `awsRequestId`).
- **batch**: two queries go in one request.
- **errors**: a `NOT_FOUND` with its `data`, through `safe()`.
- **rich types**: a `Date` and a `Map` round-trip, with danSON on both ends.
- **files**: a `File` input as multipart, and a `File` output.
- **streaming**: `countdown` yields one item, then waits for the client's `release` call. A runtime that streams delivers the first item, so the client releases it (`first,released`). A buffered one sends nothing until the wait times out (`first,timed out`), which is what buffered Lambda does.
- **sse resume**: a subscription over SSE resumes after `lastEventId`.
- **cors**: `cors()` answers a preflight for the allowed origin, with the requested `content-type`, and not for another.
- **services**: the `Visits` service comes from the server's layer: memory on servers, Workers KV on the Worker.
- **websocket**: queries, a resumed subscription and a streamed output over `wsLink`; **websocket origin**: a cross-origin upgrade is refused.

## Notes per runtime

- **Bun:** `Bun.serve` takes `handler.fetch`, but Bun's server WebSockets aren't web-standard. For WebSockets, `bun/effect-server.ts` runs `serve(handler)` on `@effect/platform-bun`'s `BunHttpServer`.
- **Deno:**
  - `cors()` wraps `handler.fetch`, but an upgrade passed to `handler.websocket` never goes through it, so `deno/server.ts` checks the origin itself before `Deno.upgradeWebSocket`.
  - Deno 2.9 prints a notice that `request.signal` also aborts after a successful response (its legacy behavior). Calls are unaffected.
- **Lambda:**
  - [`lambda/function-url.ts`](./lambda/function-url.ts) stands in for a function URL: it turns each request into a payload 2.0 event, and in `streaming` mode reads the streaming handler's prelude and forwards the body as it's written, as `InvokeMode: RESPONSE_STREAM` does.
  - `lambda/start.ts` also calls `main` directly with REST API and ALB (payload 1.0) events.
  - Deploy `lambda/server.ts` as is: outside Lambda, `streaming` is the bare handler, and inside it is wrapped with `awslambda.streamifyResponse`.
- **Workers:** the handler is created once, outside any request, so its `Visits` layer reads the KV binding from `cloudflare:workers`' `env`. WebSockets on Workers need a Durable Object; [`examples/cloudflare`](../cloudflare) has one. `pnpm run deploy` deploys it, and Wrangler provisions the KV namespace.

## Running

- `pnpm start` runs every runtime against the client; `pnpm start:node`, `start:bun`, `start:deno`, `start:lambda` or `start:workers` runs one. Bun and Deno must be on `PATH`: outside CI, a runtime that isn't installed is skipped; in CI (`CI` set) it fails. From `next/`, `pnpm example` runs `pnpm start` with every other example's.
- `pnpm server` (Node), `server:bun`, `server:bun-effect`, `server:deno`, `server:lambda` (streaming) or `server:workers` (`wrangler dev`) serves one runtime on `PORT` (default 3000; `wrangler dev` takes `--port`). Then `pnpm client [url]` runs the client against it; pass `--no-websockets` for a server without them (`Bun.serve`, Lambda, Workers) and `--buffered` for buffered Lambda (`node lambda/function-url.ts buffered`).

`pnpm typecheck` checks each runtime's files with its own types (`tsconfig.json` for Node, Lambda, the client and the start scripts, then `tsconfig.bun.json`, `tsconfig.deno.json` and `tsconfig.worker.json`). Deno's globals come from the small [`deno/globals.d.ts`](./deno/globals.d.ts), so this needs no Deno install; `deno check deno/server.ts` checks it against Deno's own types.
