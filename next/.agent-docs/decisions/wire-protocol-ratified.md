# The wire protocol is ratified as built, with protocol version `12` (human)

- Human, 2026-10-15 (decisions round 3, Q18 = proposal 10 Q10.1, Q10.4–Q10.6): "A. The version header should be 12 BTW".
- The protocol in [`wire-protocol.md`](./wire-protocol.md) stands: GET queries with readable sorted params, POST mutations with `content-type: application/json`, opt-in batching (`trpc-batch: 1`, JSONL in completion order), JSONL only when an output has deferred values, SSE subscriptions, and the WebSocket/MessagePort message set.
- Bodies keep progressive JSON's `{ json, refs? }` wrapper; this closes that file's open item.
- The protocol version is `12`: `trpc-version: 12` on HTTP requests and responses, and `version: 12` in the socket `init` message. A mismatch is still `UNSUPPORTED_PROTOCOL` (400) over HTTP and close code 1002 on sockets.
- (agent) The version tracks tRPC's major version, so a future breaking wire change ships as a new major with its own number; old clients are served by interop handlers ([`no-backwards-compatibility-yet.md`](./no-backwards-compatibility-yet.md)).
- Why: the wrapper keeps every body unambiguous; the version number says which tRPC a client speaks.
- Lost: plain unwrapped JSON bodies.
- Lives in: `packages/trpc/src/internal/protocol.ts` (`PROTOCOL_VERSION = '12'`).
