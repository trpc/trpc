# Serializers are replaceable: none, sync or streaming (human)

- Alex, 2026-10-15 (decisions round 3, Q19 = proposal 11 Q11.4/Q11.5): "Let's do B. Some people may not want a serializer at all. It makes it tricky though as we can see in the trpc code, but that's okay. So we should have options for sync transformers like superjson/devalue and async ones like danson thay can do anything and make sure thay we have that json transform of types when there isn't a standard one. We may not even go with danson as our default and do something else before we do final release of this version, we're still pre beta".
- The RPC serializer can be replaced wholesale. Three kinds:
  - **None**: plain `JSON`.
  - **Sync**: whole values in and out (superjson, devalue).
  - **Streaming**: handles deferred values, streams and files itself (danSON).
- Client types follow the serializer. Without one that keeps a type (plain JSON, or a type superjson doesn't know), the client sees the JSON form of the output (`Date` → `string`, `Map` → `{}`, `undefined` keys dropped), like v11's `inferTransformedProcedureOutput`.
- danSON as the default is provisional; the default may change before the final release (still pre-beta). Supersedes the "extend only" reading of [`serializer.md`](./serializer.md).
- (agent) With a sync serializer or none, the transport frames streams: JSONL chunks and SSE events each carry one serialized value, as v11 does. Nested promises and iterables, and `File`/`Blob` outputs nested in other values, need a streaming serializer; root `File`/`Blob` outputs still work as raw responses on unbatched HTTP ([`files.md`](./files.md)).
- (agent) Readable GET params (`?id=1&tags[]=a`) are the streaming default's encoding; other serializers use `?input=<serialized JSON>`.
- Why: some apps want no serializer, or one they already use; the type transform keeps clients honest when types don't survive.
- Lost: one format with guaranteed native types everywhere; more transport code (two framing paths, as v11 has).
- Open:
  - Where client types learn the serializer: declared on `initTrpc` so it flows through `AppRouter` and is checked against the handler and link (proposal 11 CT-C, the agent's lean), or a client type parameter (CT-B).
  - The serializer interface for the three kinds, and whether danSON stays the default.
- Lives in: `packages/trpcdev/src/serializer/`, `src/server/fetch.ts`, `src/client/links/http.ts`, `src/server/init.ts` (not built yet).
