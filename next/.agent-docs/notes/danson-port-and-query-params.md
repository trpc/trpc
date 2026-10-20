# danSON port on Effect + QP-C legible GET params

- **Date:** 2026-10-09
- **Questions:** (1) Can danSON be ported with its async half on Effect `Stream` while staying wire-compatible with standalone `danson`? (2) Does QP-C (bracket notation + relaxed-JSON leaves + `$Type:value`) round-trip deterministically without a schema, and what does it cost?
- **Feeds:** [11 — Serialization, query params and files](../proposals/11-serialization-and-files.md) (Q11.1, Q11.2, Q11.3, (e) hardening)
- **Code:** [`next/spikes/danson/`](../../spikes/danson/). `query.test.ts` runs in `pnpm test` (the port's `danson.test.ts` was removed once the port shipped; git has it); numbers come from `node danson/compare.ts` (run in `next/spikes`).

## What was built

| File        | What                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sync.ts`   | Port of danSON 0.13.1 `serializeSync`/`deserializeSync`; same format. Adds forbidden keys (`__proto__`, `constructor`, `prototype`) and `maxDepth` (default 64)                      |
| `std.ts`    | Port of the built-in types. `TypedArray` uses an allow-list of constructors; `inputDeserializers` excludes `RegExp`                                                                  |
| `stream.ts` | danSON's async format on Effect: `serializeStream(value): Stream<Frame>`, `deserializeStream(Stream<Frame>): Effect<T>`, JSONL framing, Promise-facing `stringifyAsync`/`parseAsync` |
| `query.ts`  | QP-C over the danSON JSON tree; `$input=<danSON JSON>` fallback (QP-A)                                                                                                               |

`danson@0.13.1` is a devDependency of the spike package only, used to prove wire compatibility.

## Results

**Wire compatibility (tests):** sync output is byte-identical to `danson.stringifySync` for primitives, every `std` type, `$`-prefixed strings, nested rich types and circular refs; each side parses the other's output. Async: port → port, port → `danson.parseAsync` and `danson.stringifyAsync` → port all pass with nested promises (two levels deep), a rejected promise, an async iterable yielding a promise, and a `ReadableStream`. The head line is emitted before deferred values settle.

**URL length (bytes of the query string):**

| input                                              | QP-A | QP-B | QP-C (`URLSearchParams`) | QP-C (legible) |
| -------------------------------------------------- | ---: | ---: | -----------------------: | -------------: |
| proposal 11 example                                |  305 |  220 |                      140 |            116 |
| `{ id }`                                           |   56 |   11 |                       11 |             11 |
| paginated list (`cursor`, `limit`, `sort{by,dir}`) |  158 |   93 |                       72 |             64 |
| search (`q`, 3 labels, 2 author objects, 2 dates)  |  488 |  413 |                      265 |            213 |

```text
?id=1&q=hello+world&tags[]=a&tags[]=b&since=$Date:2026-10-09T00:00:00.000Z&filter[status]=open&filter[archived]=false
?q=trpc+effect&labels[]=bug&labels[]=help+wanted&authors[0][login]=katt&authors[1][login]=juliusmarminge&range[from]=$Date:1970-01-01T00:00:00.000Z&…
```

**Throughput** ("search" input, Node 24.21, one run, ops/s; indicative only):

| operation                        |            ops/s |
| -------------------------------- | ---------------: |
| `JSON.stringify` (no rich types) |          402 752 |
| port `stringifySync`             |          101 166 |
| danson `stringifySync`           |          102 175 |
| port `parseSync`                 |          239 871 |
| danson `parseSync`               |          219 122 |
| QP-A encode / decode             | 79 430 / 187 756 |
| QP-C encode / decode             |  16 212 / 19 976 |

## Findings

1. **The port is small and wire-compatible.** About 230 lines for sync + std. The Effect `Stream` async half is about 300 lines with the JSONL and Promise wrappers, versus danSON's ~680 lines of async + `mergeAsyncIterable` + deferred helpers. `Stream.callback` + `forkScoped` per deferred value replaces the hand-written async-iterable merger, and `Stream.toAsyncIterable`/`toReadableStream` give consumers plain Promise/AsyncIterable/ReadableStream values.
2. **Effect scheduling caveat:** Effect starts a stream on a later tick than an async generator does. Registering a `Promise` only when the stream starts left rejections unhandled (Node `unhandledRejection`) for one macrotask. The fix is to serialize the head eagerly, when `serializeStream` is called, which registers every deferred value and attaches a no-op `catch` at once. The protocol layer needs the same discipline: no scheduler hop between a resolver returning and its output being traversed.
3. **Async-iterable return values are dropped** on the deserialize side (`Stream.toAsyncIterable` has no return channel). danSON keeps them. This is only an issue if return values are part of the subscription API (14).
4. **Security issues in `danson@0.13.1` itself** (worth fixing upstream whatever is decided):
   - `std` `TypedArray` deserialization does `new globalThis[name](data)` with an attacker-controlled `name`, so `["Error", ["boom"]]` builds an `Error`; on Node 24, `WebSocket` with a URL is reachable the same way. The port uses an allow-list (there is a test for this).
   - No forbidden-key or depth checks. Objects are null-prototype, which blocks prototype pollution, but the port still rejects those keys outright.
5. **`danson@0.13.1` bug:** `stringifyAsync` throws serializing a `ReadableStream` (`reader.releaseLock()` then `reader.cancel()` → "reader is not attached"). The port does not have this bug; the `danson → port` test avoids `ReadableStream`.
6. **Only cycles become refs** unless `dedupe` is on: `{ a, list: [a] }` deserializes `list[0]` as a copy of `a`. This is danSON's documented behaviour and matters for 11's "refs" claim.

### QP-C rules as prototyped

- Structure: `a[b]` for objects; `a[]=x` for arrays whose elements are all leaves; `a[0][b]` otherwise. A container is an array iff its next segment is `[]` or an integer.
- Leaves: `null`/booleans/numbers as JSON text. Strings are raw unless decoding the raw form would not give the same string (`"true"`, `"1"`, `" 1"`, `"1e3"`, `"[]"`, `"\"q\""`), in which case they are JSON-quoted. Empty `[]`/`{}` are leaves (`m[1]=[]`), so **empty containers do not need the QP-A fallback** (a change from the proposal text).
- `$Type:value` is used only when the danSON custom value is a string (`$Date:…`, `$BigInt:…`, `$URL:…`). Other custom values are encoded structurally (`s[_]=$&s[type]=Set&s[value][]=1`), so no type is excluded.
- danSON placeholders pass through raw (`$undefined`, `$NaN`, `$-0`); user strings starting with `$` are JSON-quoted (`"$undefined"`).
- **Fallback (`$input=<danSON JSON>`)** for non-object roots, refs, and object keys that are empty, integer-like, contain `[`/`]`, or start with `$`. The reserved `$input` name avoids colliding with a user field called `input`.
- The decoder is strict and throws on malformed keys, prototype segments, non-contiguous indices and object/array conflicts.
- `URLSearchParams` percent-encodes `[`, `]`, `$` and `:`. The legible form needs a custom encoder (`encodeLegible`); both forms decode the same.
- QP-C encode/decode is 5–10× slower than QP-A here (≈60 µs vs ≈5–13 µs). It is unoptimised (regexes, `JSON.parse` attempts per leaf) and only applies to GET inputs.

## Not covered

- Files/multipart (11 (f)), the event-stream framing, the OpenAPI schema-coerced variant of the bracket parser (18), limits on stream chunk count and ref count, and bundle size of the serializer (see `effect-client-bundle-size.md`).
