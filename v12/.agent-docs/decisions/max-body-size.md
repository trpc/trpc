# Request bodies have no size limit unless `maxBodySize` is set (human)

- Human, 2026-11-03 (relayed): remove v12's default body limit and keep `maxBodySize` opt-in, with docs. Body size is normally capped by the server, framework or proxy, and nobody expects Express to guard against this by default.
- (agent) Unset means no limit in every handler that reads a body: `createFetchHandler`, `createV11Handler`, `experimental_createOpenApiHandler` and `experimental_createMcpHandler`. A set `maxBodySize` answers a larger JSON, multipart or form body with `413 PAYLOAD_TOO_LARGE`. Byte stream inputs use their schema's `maxBytes` instead ([`byte-stream-inputs.md`](./byte-stream-inputs.md)).
- Why: the host already decides how large a request may be, and a second default in tRPC rejected uploads that the host allowed.
- Lost: the earlier 1 MiB default, which protected Node apps that had nothing else capping bodies. The docs now tell those apps to set `maxBodySize`.
- Open: nothing.
- Lives in: `packages/trpc/src/server/handler/http-handler.ts` (`makeHttpHandler`), `packages/trpc/src/interop/handler/handler.ts`, `packages/trpc/src/openapi/handler.ts` and `packages/trpc/src/mcp/handler.ts`, tested by `packages/trpc/src/server/handler/max-body-size.test.ts`.
