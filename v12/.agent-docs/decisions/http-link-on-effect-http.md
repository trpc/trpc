# `httpLink` batches through a data loader and sends through `effect/http`'s `HttpClient` (human asked)

- Human, 2026-10-18: "For http link you can probably do some sort of data loader service that is decoupled from http logic. And you can probably use effects primitive for fetch etc". The same day: "reimplementing effect internals seems dumb no matter the reason, so get rid of that, that's the wrong optimisation" ([`effect-apis-over-hand-rolled.md`](./effect-apis-over-hand-rolled.md)).
- (agent) `client/links/http/` splits the link into four files:
  - `batch.ts`: `makeBatcher({ key, maxItems, send })`, a data loader on `Effect.request` and a `RequestResolver`. It knows nothing of HTTP. Calls made in the same macrotask with the same key, at most `maxItems`, go to `send` as one `Batch`. A `Batch` carries its calls, a `scope` that closes when a caller stops waiting and every other call is gone too, and `settle(i, exit)` / `settleWith(i, effect)` to answer them. A call keeps its first answer. Once `send` ends and the answers it forked finish, the calls still open fail with its error, or as "The batch response ended without a result".
  - `transport.ts`: the HTTP side. It builds requests (URL, method, headers, `init`, bodies), runs them through `HttpClient`, reads bodies through `HttpClientResponse` (`text`, `stream`), and maps errors. It also holds a call sent alone (`single`), the batch's `send`, and resumed streams.
  - `sse.ts`: subscriptions, one scoped connection at a time, reconnected with `Effect.repeat(connect, { until })`. The delay before a reconnect sits at the start of `connect`. The attempt count still resets on a heard event, so a `Schedule` can't hold it.
  - `link.ts`: the options, `HttpLinkDecl` and the wiring.
- (agent) `effect/http` carries:
  - `HttpClientRequest.make(method)(url, { headers })`. The body goes on last with `setBody`, which sets `content-type`: `HttpBody.raw` for JSON (the string reaches `fetch` as is) and `HttpBody.formData` for files.
  - `FetchHttpClient.layer`, built once per link, with `HttpClient.withScope`.
  - The custom `fetch`, through the `FetchHttpClient.Fetch` reference.
  - `init` (`credentials`, `cache`, Next's `next`) through the `FetchHttpClient.RequestInit` service.
  - Bodies: `HttpClientResponse.text` for JSON and errors, and `HttpClientResponse.stream` for JSONL, frames and SSE. Lines come from `Stream.decodeText` and `Stream.splitLines` (`textLines` and `sseEvents` in `internal/protocol.ts`, which `experimental_openApiLink` reads too).
  - (agent, 2026-10-20) `parseSse`, `sseEvents` as an `AsyncIterable` over a web body, is gone: once `experimental_openApiLink` read `sseEvents` directly, only its own test used it. That test's case (a CRLF split across chunks) now runs on `sseEvents`.
  - Errors: an `HttpClientError` maps to what it wraps (its `reason.cause`), so an abort is still `CLIENT_CLOSED_REQUEST` and anything else `NETWORK_ERROR` with the cause's message.
- (agent) What `HttpClient` can't express, kept narrow:
  - The web `Response`: `HttpClientResponse` keeps it private, yet raw responses (`trpc-response: 1`) promise it as the output ([`raw-responses.md`](./raw-responses.md)). `onResponse` gets web `Headers`; Effect's `Headers` keep one `set-cookie`, where `getSetCookie()` keeps all. `File` outputs read it with `res.blob()`, which a browser can keep on disk. So the per-request `Fetch` wrapper catches the web `Response` on its way out, next to the serializer check (`UNSUPPORTED_PROTOCOL`).
  - The custom `fetch`'s arguments: `FetchHttpClient` passes a `URL` and Effect `Headers`. The wrapper hands on a string and web `Headers`, and merges `op.signal` into the signal, because a deferred body keeps streaming after its call returns and only the request's signal can stop it then.
  - Aborts: `HttpClient` aborts an unscoped request when its response is garbage collected, or after 5 s unread where `FinalizationRegistry` is missing (Hermes), unless a body accessor unregisters it. Raw responses and `File` bodies are read off the web `Response`, and progressive JSON's deferred bodies outlive the call, so every request runs under `withScope` with a scope the link closes. A call alone (`abortOnInterrupt`) and a resumed stream close it only if interrupted before they return. A batch's scope closes once it's no longer needed. An SSE connection's closes when the connection ends or the subscription stops.
  - Tracing: `HttpClient` would open its own client span and send its trace headers. The link turns that off (`TracerDisabledWhen`), so requests still carry only the call span's `op.trace` headers, and none without a tracer: no CORS preflight ([`tracing-across-client-and-server.md`](./tracing-across-client-and-server.md)).
  - SSE events: `effect/encoding`'s `Sse` parser drops an event with no `data` line, so `event: done` with no data would no longer end a subscription (and it fails on `retry:` lines). Only the field rules are tRPC's (`sseEvents`); text and lines are Effect's.
- (agent) Parsing JSONL goes through `Stream.mapEffect`, one line at a time, because `Stream.splitLines` hands on several lines at once and a `Stream.map` that throws would lose the readable lines before a broken one. A broken line is still a defect, so deferred values still open fail as a broken stream ("Stream failed").
- (agent) Gzipped bytes, minimal / full, measured with the budget's bundler after each change:

  | change                                            | minimal |   full |
  | ------------------------------------------------- | ------: | -----: |
  | before                                            |  30,049 | 34,026 |
  | batching as a data loader (`batch.ts`)            |    +228 |   +199 |
  | `Stream.decodeText` and `Stream.splitLines` lines |    +182 |   +213 |
  | `HttpClient` transport                            |  +8,032 | +8,220 |
  | SSE reconnects with `Effect.repeat`               |    +681 |   +659 |
  | an invalid URL's message                          |     +12 |    +13 |
  | after                                             |  39,184 | 43,330 |

  The ceilings, dropped since, rose to 39.3 and 43.5 kB ([`orpc-v2-parity.md`](./orpc-v2-parity.md)). `HttpClient` is most of it: the client, its request and response models, `Headers`, `UrlParams` and `HttpBody`.

- Why: batching is a data loader any transport could use, and HTTP lives in one place. Requests, bodies and their errors go through Effect's HTTP models, so Effect's fixes reach the link with the version bump, and apps that already use `HttpClient` bundle it once.
- Lost:
  - 9.1 kB gzipped on the minimal client and 9.3 kB on the full one, each that much further from its target (18 and 25 kB).
  - `HttpClient` resolves the URL with `new URL(url, location)` before `fetch`, so a custom `fetch` gets an absolute URL even when the link's `url` is relative. A relative URL with no `location` (Node, React Native) fails before `fetch` instead of in it, still as `NETWORK_ERROR` with `new URL`'s message.
  - A lone `\r` now ends a JSONL line, as it does in SSE.
  - The `init` a custom `fetch` gets has `body` and `duplex` keys set to `undefined` on bodiless requests.
  - A user `content-type` header on a multipart call is dropped (`setBody` lets `fetch` set the boundary).
- Open:
  - A client that never imports `HttpClient` can't shed it: it comes with `httpLink`.
  - Raw responses, `onResponse` and `File` outputs depend on catching the web `Response` in `fetch`; an `HttpClientResponse` accessor for it would remove the wrapper's capture.
- Lives in: `packages/trpc/src/client/links/http/` (`batch.ts`, `transport.ts`, `sse.ts`, `link.ts`), `src/internal/protocol.ts` (`textLines`, `sseEvents`), `tooling/bench/bench.ts` (`budgets`), `.agent-docs/notes/benchmarks.md` (Budgets); tests in `packages/trpc/src/client/links/http.test.ts`, `http-edges.test.ts`, `src/internal/protocol.test.ts`.
