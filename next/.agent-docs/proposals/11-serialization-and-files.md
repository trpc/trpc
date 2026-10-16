# 11 — Serialization, legible query params and files

| Status     | Area                     | Depends on | oRPC parity rows                                                                                    |
| ---------- | ------------------------ | ---------- | --------------------------------------------------------------------------------------------------- |
| `proposed` | server, client, protocol | 10, 14     | **Native types**, **End-to-end typesafe File/Blob**, End-to-end typesafe streaming, OpenAPI support |

## Summary

`ideas.md` makes three points about serialization:

- "Transformers should be on the API endpoints, not in the `init` function of tRPC."
- "We should probably have a library like [danSON](https://github.com/KATT/danson) as part of tRPC that we can use for serializing and deserializing data…"
- "I do like how oRPC does sort of semantic query params etc though, so maybe that's something to consider for the sync serialization that it could be part of query params in a legible way."

**Recommendation:**

- **Port danSON into `trpcdev/serializer`** as the default RPC serializer. It covers rich types, refs and circular references, and streaming of Promises, AsyncIterables and ReadableStreams at any depth. Its async internals are rewritten on Effect `Stream`.
- Serializers are configured on endpoints and links.
- Add a **legible query-param encoding** for GET inputs: bracket notation with typed leaves.
- Files are a serializer type backed by multipart parts.
- OpenAPI endpoints use plain JSON.

## Today (v11)

- `initTRPC.create({ transformer: superjson })` puts the transformer on the router. Every link must also be given `transformer`.
- Without a transformer, the client types are JSON-ified via `inferTransformedProcedureOutput`. This means the root config controls client types, and one router cannot be served with two serializations.
- Streaming is a separate JSONL codec in `stream/jsonl.ts`, which handles nested promises and iterables but is independent of the transformer.
- Files only work as a top-level `FormData` or octet input (`octetInputParser`). Binary outputs are not supported.
- GET inputs are `?input=<URL-encoded JSON>`, which is illegible in logs and devtools.
- WebSocket has a separate `experimental_encoder`.

## danSON in brief

Source: [github.com/KATT/danson](https://github.com/KATT/danson), `danson@0.13.1` on npm, MIT, by KATT.

**Sync format.** The output is `{ json, refs? }`. Non-JSON values are **inline** custom values, `{ "_": "$", "type": "Date", "value": "2026-10-09T00:00:00.000Z" }`. Constants are placeholder strings (`"$undefined"`, `"$NaN"`, `"$-0"`), and strings starting with `$` are escaped. `refs` carries de-duplicated and circular references (`"$1"`).

**Async format.** The head chunk contains placeholders such as `{ "_": "$", "type": "Promise", "value": 1 }`. Later chunks are `[index, status, { json }]`, where status is `0` for a value, `1` for a failure and `2` for a return. A `text/event-stream` variant (`data: …`) exists as well.

**Built-in (`std`) types:** BigInt, Date, Headers, Map, Set, RegExp, TypedArrays, URL, URLSearchParams, undefined, NaN, ±Infinity and -0.

**Custom types** are a `serializers` / `deserializers` record keyed by type name, with a `TransformerPair<TOriginal, TSerialized>` helper type.

**Compared with oRPC's format** (`{ json, meta: [[typeCode, ...path]] }`):

| Aspect                          | danSON                                                | oRPC                                       |
| ------------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Where type information lives    | Inline, next to each value; readable in a single pass | In `meta`, beside an unchanged JSON tree   |
| Promises and iterables          | Streamed **at any depth**                             | Event iterators at the root only           |
| Refs and circular references    | Supported                                             | Not supported                              |
| What a naive JSON consumer sees | Marker objects                                        | A clean `json` tree (dates as ISO strings) |

The last row matters less for us because naive consumers use the OpenAPI endpoint (18).

## Goals

- One router, many endpoints: rich RPC, plain-JSON OpenAPI, and maybe binary formats later.
- Native types, deferred values and streams work without installing anything, in **one** format. This replaces superjson, the JSONL codec and the WebSocket encoder.
- Legible URLs for GET queries.
- Files and blobs are typed end to end, including in nested inputs.
- Hardened deserialization of untrusted input by default.

## Decision areas

### (a) Where serializers live

Serializers are an option on endpoints and links, never on the router:

```ts
import { serializer } from 'trpcdev/serializer';

export const appSerializer = serializer({ types: { Decimal: decimalPair } }); // shared module

createHandler({ router, serializer: appSerializer }); // default: serializer()
httpLink({ url, serializer: appSerializer });
createOpenAPIHandler({ router }); // always plain JSON + bracket notation + coercion (18)
```

### (b) The default serializer

- **S-A — danSON, ported into `trpcdev/serializer`.**
  - Sync functions stay plain, pure functions for speed.
  - Async (streaming) functions are reimplemented on Effect `Stream`, following "all logic in Effect".
  - The same format is used for request bodies, responses, JSONL, SSE, WebSocket and MessagePort.
- **S-B — oRPC-style `{ json, meta }`.**
  - Friendlier to naive JSON readers.
  - ❌ A separate streaming codec is still needed. No refs and no nested deferral.
- **S-C — Plain JSON by default; rich serializer opt-in.** This is v11's model without superjson.
- **S-D — Bring your own** (superjson, devalue) via an interface, with no built-in.

The output `{ id: 1, createdAt: new Date('2026-10-09') }` on the wire:

```text
S-A  {"json":{"id":1,"createdAt":{"_":"$","type":"Date","value":"2026-10-09T00:00:00.000Z"}}}
S-B  {"json":{"id":1,"createdAt":"2026-10-09T00:00:00.000Z"},"meta":[[1,"createdAt"]]}
S-C  {"id":1,"createdAt":"2026-10-09T00:00:00.000Z"}          client sees createdAt: string
S-D  with superjson: {"json":{"id":1,"createdAt":"2026-10-09T00:00:00.000Z"},"meta":{"values":{"createdAt":["Date"]}}}
```

```ts
// S-C: plain JSON unless the endpoint and link opt in
createHandler({ router, serializer: serializer() });
httpLink({ url, serializer: serializer() });

// S-D: no built-in; every endpoint and link is given one
import superjson from 'superjson';
createHandler({ router, serializer: superjson }); // interface TBD
httpLink({ url, serializer: superjson });
```

**How danSON gets in:** porting the code (KATT owns it) keeps the "only Effect" dependency rule. Depending on the `danson` npm package would be simpler but adds a dependency. **Open:** keep wire compatibility with standalone `danson`, so it can decode tRPC payloads.

```ts
// wire-compatible: a consumer without trpcdev decodes a response with danson
import { parseSync } from 'danson';

const post = parseSync(await (await fetch(`${base}/post/byId?id=1`)).text());
```

### (c) Legible query params for GET inputs

Example input: `{ id: 1, q: 'hello world', tags: ['a', 'b'], since: new Date('2026-10-09'), filter: { status: 'open', archived: false } }`

| Option                                                                 | URL                                                                                                                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **QP-A** One JSON param (v11)                                          | `?input=%7B%22id%22%3A1%2C%22q%22%3A%22hello%20world%22%2C…`                                                                                    |
| **QP-B** One param per top-level key, each holding relaxed danSON-JSON | `?id=1&q=hello+world&tags=["a","b"]&since={"_":"$","type":"Date","value":"2026-10-09T00:00:00.000Z"}&filter={"status":"open","archived":false}` |
| **QP-C** Bracket notation (oRPC-style) with typed leaves               | `?id=1&q=hello+world&tags[]=a&tags[]=b&since=$Date:2026-10-09T00:00:00.000Z&filter[status]=open&filter[archived]=false`                         |

QP-C rules (to be prototyped):

- Structure uses bracket notation: the same parser as OpenAPI (18) and `action()` forms (15).
- Leaves are parsed as JSON scalars when valid (`1`, `true`, `null`), and otherwise taken as strings. The client serializer quotes strings that would be ambiguous (`q="true"`), so encoding stays canonical and decoding deterministic **without a schema**.
- Custom types whose serialized value is a scalar use `$Type:value`, and constants use `$undefined`/`$NaN`. danSON already escapes `$`-prefixed strings.
- Empty arrays and objects, refs, and non-object root inputs fall back to QP-A.

The OpenAPI handler uses the same bracket parser but coerces leaves using the schema instead of relaxed JSON (18).

> **Spike (2026-10-09):** [`notes/danson-port-and-query-params.md`](../notes/danson-port-and-query-params.md). danSON ports onto Effect `Stream` with byte-identical output to `danson@0.13.1`. QP-C round-trips without a schema; URLs are 2–4× shorter than QP-A; empty containers don't need the fallback. Also found two hardening gaps in `danson@0.13.1` itself.

### (d) Client types

Types follow the RPC serializer, which no longer appears on the router. Options:

- **CT-A — RPC types are always "native".** The client sees `Date`, `Map`, nested `Promise`s and so on, because every RPC serializer must be at least as expressive as the built-in one. Plain-JSON consumers (OpenAPI clients) see `Jsonify<Output>`.
- **CT-B — The serializer becomes a client type parameter**, with a default.
- **CT-C — The router declares a type-only capability** (`initTRPC<{ ctx; serializer: 'json' }>()`), and endpoints are checked against it.

```ts
// CT-A
const post = await client.post.byId.query({ id: 1 });
post.createdAt; // Date, over any RPC endpoint
// via openAPILink (18): string

// CT-B
createTRPCClient<AppRouter>({ links }); // createdAt: Date (default)
createTRPCClient<AppRouter, { serializer: 'json' }>({ links }); // createdAt: string; shape TBD

// CT-C
const t = initTRPC<{ ctx: Context; serializer: 'json' }>();
// every client of this router sees createdAt: string
createHandler({ router: appRouter, serializer: appSerializer }); // checked against 'json'
```

### (e) Hardening (inputs are untrusted)

- Null-prototype objects (danSON's `createObject`). Reject `__proto__`, `constructor` and `prototype` keys.
- Limits on depth, size, ref count and stream chunk count, configurable on the handler.
- **Separate allow-lists for inputs and outputs.** For example `RegExp` is output-only by default (ReDoS), and deferred types (`Promise`, `AsyncIterable`, `ReadableStream`) are rejected in inputs in v1 (no client-to-server streaming yet).
- Custom deserializers only receive JSON values and never evaluate code.

```ts
createHandler({
  router,
  serializer: appSerializer,
  limits: { maxDepth: 64, maxRefs: 1_000, maxStreamChunks: 10_000 }, // names TBD
});

// rejected in inputs by default, before the resolver runs:
// {"json":{"__proto__":{…}}}                                     forbidden key
// {"json":{"q":{"_":"$","type":"RegExp","value":…}}}             RegExp is output-only
// {"json":{"later":{"_":"$","type":"Promise","value":1}}}        no deferred inputs in v1
```

### (f) Files and blobs

- `File` and `Blob` are serializer types. In requests they reference multipart parts: `{ "_": "$", "type": "File", "value": { "part": 0, "name": "a.png", "type": "image/png" } }`, with the bytes in part `0` of `multipart/form-data`. They can appear anywhere in the input. Schemas validate them (`z.file()`, `Schema.instanceOf(File)`).
- A root-level `File`/`Blob` output is sent as a binary response with `content-type`/`content-disposition`. Nested blobs in outputs could become danSON `ReadableStream` chunks (**open**).
- Large uploads stay out of scope (use presigned URLs). Body limits apply (13).

```ts
const setCover = t.procedure
  .input(z.object({ postId: z.string(), cover: z.file() }))
  .mutation(({ input }) => storage.put(input.postId, input.cover));

const avatar = t.procedure
  .input(z.object({ userId: z.string() }))
  .query(({ input }) => storage.avatar(input.userId)); // returns a File

await client.post.setCover.mutate({ postId: '1', cover: file }); // sent as multipart
const img = await client.user.avatar.query({ userId: 'u1' }); // File
```

On the wire (`input` as the name of the JSON part is a placeholder):

```http
POST /trpc/post/setCover
content-type: multipart/form-data; boundary=b

--b
content-disposition: form-data; name="input"
content-type: application/json

{"json":{"postId":"1","cover":{"_":"$","type":"File","value":{"part":0,"name":"a.png","type":"image/png"}}}}
--b
content-disposition: form-data; name="0"; filename="a.png"
content-type: image/png

<bytes>
--b--
```

```http
GET /trpc/user/avatar?userId=u1

HTTP/1.1 200 OK
content-type: image/png
content-disposition: attachment; filename="avatar.png"

<bytes>
```

## Recommendation

- **S-A** (danSON ported into `trpcdev/serializer`, async parts on Effect).
- **QP-C** legible params, prototyped behind the serializer spike, with QP-A as fallback.
- **CT-A** (native RPC types).
- Hardening with separate input and output allow-lists.
- Files as multipart-backed serializer types.

Adopting danSON also makes nested deferred values (14 (e)) nearly free.

> ⚠️ **Parity:** a router-level transformer (today's model) blocks serving the same router over RPC and OpenAPI. Not having a default rich serializer keeps "Native types" at 🟡. File inputs limited to top-level `FormData` keep "File/Blob" at 🟡.

## Questions

- **Q11.1** Default serializer: danSON ported in (S-A), oRPC-style (S-B), plain JSON (S-C) or bring your own (S-D)?
- **Q11.2** Port danSON's code into `trpcdev/serializer` (recommended), or depend on the `danson` package? Keep wire compatibility with standalone danSON?
- **Q11.3** GET input encoding: QP-A, QP-B or QP-C? Is the `$Type:value` scalar syntax acceptable?
- **Q11.4** Allow replacing the RPC serializer entirely (for example superjson), or only extending the built-in with custom types?
- **Q11.5** Client types: always native (CT-A), a client type parameter (CT-B), or a router capability flag (CT-C)?
- **Q11.6** Files: anywhere in input (yes?); outputs root-only, or nested via streams?

## Decision

- **Q11.1:** [ ] S-A · [ ] S-B · [ ] S-C · [ ] S-D
- **Q11.2:** [ ] port · [ ] depend — wire-compatible: [ ] yes · [ ] no
- **Q11.3:** [ ] QP-A · [ ] QP-B · [ ] QP-C — `$Type:value`: [ ] ok · [ ] other
- **Q11.4:** [ ] replace allowed · [ ] extend only
- **Q11.5:** [ ] CT-A · [ ] CT-B · [ ] CT-C
- **Q11.6:** input anywhere [ ] yes · [ ] no — outputs [ ] root-only · [ ] nested
- **Notes:**
