# Request bodies are capped at 10 MiB by default (human)

- Human, 2026-11-03 (relayed): "the default changed to 10 MB in v12". v11's Node adapters have no default limit.
- (agent) `maxBodySize` takes a byte count or `false` for no limit, the way `sse.pingInterval` and `batch` take `false`. It applies to every handler that reads a body: `createFetchHandler`, `createV11Handler`, `experimental_createOpenApiHandler` and `experimental_createMcpHandler`. Byte stream inputs still use their schema's `maxBytes` instead ([`byte-stream-inputs.md`](./byte-stream-inputs.md)).
- Why: an unlimited default lets one request exhaust a server's memory. 10 MiB is far above a typical JSON input and leaves room for small file uploads.
- Lost: the earlier 1 MiB default, which rejected modest uploads without a setting.
- Open: nothing.
- Lives in: `resolveMaxBodySize` in `packages/trpc/src/server/handler/body.ts`, tested by `packages/trpc/src/server/handler/max-body-size.test.ts`.
