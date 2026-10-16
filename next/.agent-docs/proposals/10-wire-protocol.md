# 10 — Wire protocol

| Status     | Area                     | Depends on | oRPC parity rows                                                               |
| ---------- | ------------------------ | ---------- | ------------------------------------------------------------------------------ |
| `proposed` | server, client, adapters | 04, 07, 11 | Batch requests, Streaming (SSE), WebSockets, **Message Port**, OpenAPI support |

## Summary

Decide the RPC wire format over HTTP, streaming, WebSockets and message ports: URLs, methods, envelopes, errors, batching, versioning and secure defaults.

**Recommendation:** a new, simpler protocol.

- Path-based URLs.
- GET for queries, POST for mutations.
- No envelope when using plain JSON.
- HTTP status codes for errors.
- Opt-in batching with streamed responses.
- One message model shared by WebSocket and MessagePort.
- A `trpc-version` header from day one.

This is separate from the OpenAPI endpoint (18), which maps procedures to REST.

## Today (v11)

- **URLs:** `GET /trpc/post.byId?input=…` and `POST /trpc/post.create`.
- **Batching:** `?batch=1` with comma-joined paths (`/trpc/a,b?batch=1&input={"0":…,"1":…}`). Responses are an array of `{ result: { data } } | { error }`, or JSONL when using `httpBatchStreamLink`.
- **Envelopes:** `{ result: { data } }` on success, `{ error: { message, code, data } }` on error. The transformer wraps both.
- **Streaming:** JSONL with nested promises and iterables (chunk references), SSE for subscriptions, and a JSON-RPC-like WebSocket protocol (`{ id, method: 'subscription', params: { path, input } }`, plus `connectionParams`).
- **Pain points:**
  - The URL format is awkward for CDNs and logs (comma-joined batch paths, huge `input` query strings).
  - Envelope noise.
  - Batching is on by default. Security fixes have had to add limits later (default `maxBatchSize`, body limits).
  - The WebSocket protocol differs from HTTP.
  - There is no versioning.

## Goals

- A readable protocol that works with plain `fetch` and `curl`, CDNs and log tooling.
- One message model across HTTP, WebSocket and MessagePort, so that new transports are cheap and stateless WebSockets (hibernation) are possible.
- Secure defaults.
- Version negotiation, for future back-compat shims (`ideas.md`: "back-compat can come later via a client tRPC-version header").

## Options

### A — Keep the v11 protocol

```http
GET /trpc/post.byId?input=%7B%22id%22%3A1%7D

HTTP/1.1 200 OK
content-type: application/json

{"result":{"data":{"id":1,"title":"Hello"}}}
```

```http
GET /trpc/post.byId,post.list?batch=1&input=%7B%220%22%3A%7B%22id%22%3A1%7D%2C%221%22%3A%7B%7D%7D

HTTP/1.1 207 Multi-Status
content-type: application/json

[{"result":{"data":{"id":1,"title":"Hello"}}},{"error":{"message":"…","code":-32004,"data":{"code":"NOT_FOUND","httpStatus":404,"path":"post.list"}}}]
```

- ✅ Old clients keep working.
- ❌ Keeps all the pain. `ideas.md` explicitly allows breaking changes, and a back-compat adapter can be added later behind the version header.

### B — New tRPC protocol (recommended)

#### Requests

| Kind                    | Request                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Query                   | `GET {base}/post/byId?id=1&tags[]=a`: legible query params (11 (c)), with `?input=<serialized>` as fallback. The client switches to `POST` (or `QUERY` later) above a URL length threshold |
| Mutation                | `POST {base}/post/create` with the serialized input as the body                                                                                                                            |
| Streamed / subscription | Same URL. `accept: text/event-stream` (SSE) or `application/jsonl` selects the stream format                                                                                               |
| Files                   | `multipart/form-data` (11)                                                                                                                                                                 |

A query with legible params, the same query above the URL length threshold (POST, or `QUERY` per Q10.3), and a mutation. With `.` as the separator (Q10.2) the paths would read `/trpc/post.byId`.

```http
GET /trpc/post/byId?id=1

POST /trpc/post/search
content-type: application/json

{"json":{"q":"…a very long query…","tags":["a","b"]}}

QUERY /trpc/post/search
content-type: application/json

{"json":{"q":"…a very long query…","tags":["a","b"]}}

POST /trpc/post/create
content-type: application/json

{"json":{"title":"Hello","publishAt":{"_":"$","type":"Date","value":"2026-10-09T00:00:00.000Z"}}}
```

#### Bodies and responses

- **Body:** the serialized input (11). With the default danSON-based serializer, inline markers only appear where there are non-JSON values, so most bodies read as plain JSON. **Open:** drop danSON's `{ json }` wrapper when there are no `refs`.
- **Success:** `2xx` with the serialized output and no envelope. The default status is 200; 201 and others can be set via `response.status` (04).
- **Error:** the status comes from the error (07), with body `{ error: { code, message, data, defined } }` (serialized). Clients detect errors by status ≥ 400.

Shown with danSON's `{ json }` wrapper kept:

```http
HTTP/1.1 200 OK
content-type: application/json

{"json":{"id":1,"title":"Hello","createdAt":{"_":"$","type":"Date","value":"2026-10-09T00:00:00.000Z"}}}
```

```http
HTTP/1.1 404 Not Found
content-type: application/json

{"json":{"error":{"code":"NOT_FOUND","message":"Post not found","data":{"id":1},"defined":true}}}
```

#### Batching

Batching is opt-in on both server and client.

- **Request:** `POST {base}` with header `trpc-batch: 1` and body `[{ path, input, method? }, …]`.
- **Response:** `application/jsonl`, one line per call as each finishes: `{ i, status, body }`. Each call keeps its own status.
- A `maxBatchSize` default (for example 20) and a body size limit apply.

```http
POST /trpc
trpc-batch: 1
content-type: application/json

[{"path":"post/byId","input":{"json":{"id":1}}},{"path":"post/byId","input":{"json":{"id":2}}}]

HTTP/1.1 200 OK
content-type: application/jsonl

{"i":1,"status":404,"body":{"json":{"error":{"code":"NOT_FOUND","message":"Post not found","data":{"id":2},"defined":true}}}}
{"i":0,"status":200,"body":{"json":{"id":1,"title":"Hello"}}}
```

#### Streaming

- Streams use the serializer's async format (danSON: a head chunk, then `[index, status, { json }]` chunks), so a stream can be the root value or nested anywhere in an output (14 (e)).
- **JSONL:** one chunk per line.
- **SSE:** one chunk per `data:` event. `id:` comes from `tracked()` (14), and streams resume with `Last-Event-ID`.

A query whose output has a nested `Promise`, over JSONL, and a resumed subscription over SSE:

```http
GET /trpc/post/stats?id=1
accept: application/jsonl

HTTP/1.1 200 OK
content-type: application/jsonl

{"json":{"views":10,"comments":{"_":"$","type":"Promise","value":1}}}
[1,0,{"json":3}]
```

```http
GET /trpc/onPost?channel=general
accept: text/event-stream
last-event-id: post_41

HTTP/1.1 200 OK
content-type: text/event-stream

data: {"json":{"_":"$","type":"AsyncIterable","value":1}}

id: post_42
data: [1,0,{"json":{"id":"post_42","title":"Hello"}}]
```

#### WebSocket and MessagePort

One message model for both:

```ts
// client → server
{ id, type: 'request', path, input, method }
{ id, type: 'abort' }
// server → client
{ id, type: 'result', body } | { id, type: 'error', body } | { id, type: 'event', body, eventId? } | { id, type: 'done' }
```

- The first message may be `{ type: 'init', connectionParams, version }`.
- Messages are self-contained, so a hibernating server can rebuild state from storage (14).

A subscription over a WebSocket (`→` client to server, `←` server to client). `method` is shown as the procedure type, as in v11's WebSocket messages; the prose above does not pin its values.

```text
→ {"type":"init","connectionParams":{"token":"…"},"version":"1"}
→ {"id":1,"type":"request","path":"onPost","input":{"json":{"channel":"general"}},"method":"subscription"}
← {"id":1,"type":"event","body":{"json":{"id":"post_42","title":"Hello"}},"eventId":"post_42"}
← {"id":1,"type":"event","body":{"json":{"id":"post_43","title":"World"}},"eventId":"post_43"}
→ {"id":1,"type":"abort"}
← {"id":1,"type":"done"}
```

#### Versioning

- Clients send `trpc-version: <protocol version>`; servers reply with the same header.
- A mismatch returns a typed `UNSUPPORTED_PROTOCOL` error.
- A future v11-compat handler can be selected on this header.

`1` stands in for the first protocol version; the header name is Q10.6.

```http
GET /trpc/post/byId?id=1
trpc-version: 1

HTTP/1.1 200 OK
trpc-version: 1
content-type: application/json

{"json":{"id":1,"title":"Hello"}}
```

#### Secure defaults

- Mutations require a non-simple content type (`application/json` or a custom `trpc-*` header), which gives CSRF protection without tokens.
- GET is allowed only for queries (oRPC's "strict GET", on by default).
- Default body and batch limits. WebSocket origin allow-list.

### C — Adopt oRPC's RPC protocol verbatim

`{ json, meta }`, `/rpc/planet/create`, batch header `x-orpc-batch`.

```http
POST /rpc/post/create
content-type: application/json

{"json":{"title":"Hello","publishAt":"2026-10-09T00:00:00.000Z"},"meta":[[1,"publishAt"]]}

HTTP/1.1 200 OK
content-type: application/json

{"json":{"id":"1","title":"Hello","publishAt":"2026-10-09T00:00:00.000Z"},"meta":[[1,"publishAt"]]}
```

Errors are `{ json: { defined, code, status, message, data }, meta }` with a 4xx/5xx status.

- ✅ Interop with oRPC clients and tooling.
- ❌ Ties our evolution to theirs. Its prefixes and type codes are oRPC-specific, and there is little real user benefit.

## Recommendation

**Option B.**

- The path separator, URL thresholds and limit defaults are open questions below.
- **Open:** HTTP `QUERY` (supported by `effect/http-api`) as the long-input fallback instead of POST, once runtime support is broad.

> ⚠️ **Parity:** the message model must not assume HTTP. MessagePort, WebSocket hibernation and future transports (stdio, workers) depend on it.

## Questions

- **Q10.1** New protocol (B), keep v11 (A) or adopt oRPC's (C)?
- **Q10.2** Path separator in URLs: `/post/byId` (REST-like, oRPC) or `/post.byId` (v11)?
- **Q10.3** Long query inputs: POST fallback, the `QUERY` method, or both behind a client option?
- **Q10.4** Batching opt-in on both sides, with a streamed JSONL response?
- **Q10.5** Default stream format for queries and mutations that return iterables: JSONL or SSE? Subscriptions default to SSE either way.
- **Q10.6** Protocol version header name (`trpc-version`?) and whether servers accept _any_ older version or reject by default.

## Decision

- **Q10.1:** [ ] A · [ ] B · [ ] C
- **Q10.2:** [ ] `/` · [x] `.` → [routers](../decisions/routers.md)
- **Q10.3:** [x] configurable (`longQuery: 'post' | 'query'`, default POST), plus canonical GET URLs → [wire-protocol](../decisions/wire-protocol.md)
- **Q10.4:** [ ] yes · [ ] on by default
- **Q10.5:** [ ] JSONL · [ ] SSE
- **Q10.6:** header `__________` · [ ] reject unknown · [ ] best effort
- **Notes:**
