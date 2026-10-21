# Nested file bytes are base64 for now; binary framing stays possible (human)

- Human, 2026-10-15 (decisions round 3, Q3): "C but don't close the door on binary as an option".
- Nested and batched `File`/`Blob` bytes stream as base64 chunks in JSONL and socket messages. A root file on an unbatched HTTP call is already the raw body ([`files.md`](./files.md)).
- Binary framing (a length-prefixed binary content type over HTTP, binary WebSocket messages) can come later, chosen by `accept`. Nothing in the wire format may assume text-only transport: the byte source is a chunk stream with an index, so a binary transport can carry the same chunks unencoded.
- Why: one format works on every link today; large downloads already skip base64 through the raw root response.
- Lost: 33% size overhead on nested files until binary lands.
- (agent) Binary framing is built, opt-in: `httpLink({ binary: true })` for HTTP frames and `wsLink({ binary: true })` for binary WebSocket messages; JSONL and text messages stay the default and are unchanged. See [`binary-frames.md`](./binary-frames.md).
- Lives in: `packages/trpc/src/transformer/progressive-json/stream.ts`, `src/internal/frames.ts`.
