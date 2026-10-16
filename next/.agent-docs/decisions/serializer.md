# Plain JSON is the default serializer; danSON is ported in and opt-in (human)

- Human, 2026-10-16 (Q11.1, decision round): "B". With no serializer, the handler and links use plain JSON (`jsonSerializer`); danSON is opt-in with `createSerializer()` on both ends. v11's default had no transformer either.
- Human, 2026-10-16 (Q11.2, decision round): "A". danSON's code is ported into `trpcdev/serializer` (Effect `Stream`s for the async format, [`../notes/danson-port-and-query-params.md`](../notes/danson-port-and-query-params.md)), not a dependency on the `danson` package; wire compatibility with standalone danSON isn't kept.
- Human, 2026-10-16 (Q11.3, decision round): "For rpc I think input should work best". RPC `GET` inputs are one `?input=<serialized JSON>` param for every serializer, keys sorted ([`wire-protocol.md`](./wire-protocol.md)). Bracket notation stays with OpenAPI and forms ([`openapi.md`](./openapi.md)).
- (agent) Built, 2026-10-16: `jsonSerializer` is the default of `createFetchHandler`, every link, `localLink` and `hydrationOptions`; `createSerializer()` is danSON; `defaultSerializer` is gone. Server stores that need rich types (durable call results, cache keys) keep danSON internally, whatever the wire serializer. Plain JSON can't carry a `bigint` or a file input; those fail before sending.
- (agent) Types that are already JSON (recursive JSON types, branded tuples, AI SDK chunks) are kept as written in the JSON form, instead of being re-mapped; a key typed `unknown` stays required. Validation error `path`s are `(string | number)[]` (symbol keys arrive as `String(key)`), so error data is plain JSON.
- Deserialized objects have `Object.prototype`, not a null prototype. The deserializer already rejects `__proto__`, `constructor` and `prototype` keys.
- Why: the default should be the smallest thing that works with any client; rich types are one option away.
- Lost: native `Date`/`Map`/`File` outputs out of the box; legible RPC query strings (QP-C).
- Lives in: `packages/trpcdev/src/serializer/`.
