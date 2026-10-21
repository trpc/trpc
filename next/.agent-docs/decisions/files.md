# Files: multipart inputs, binary root outputs, streamed nested outputs (human)

- Human, 2026-10-15 (issues review Q1, proposal Q11.6): "A on openapi but b on rpc unless it's not in a batch".
  - OpenAPI: a root `File` or `Blob` output is the response body.
  - RPC: a `File` or `Blob` can sit anywhere in an output and streams as progressive JSON chunks.
  - An unbatched RPC call whose output is a root `File` or `Blob` gets a raw binary response with `content-type` and `content-disposition`, and the client rebuilds the `File`.
- (agent) Inputs: `File` and `Blob` can sit anywhere in an input. They become `{ _: '$', type: 'File', value: { part, name, type, lastModified } }` markers, with the bytes in multipart parts `0`, `1`, … and the JSON in the `input` field. Only per-call serializers with `parts` know these types, so a JSON body can't claim a file, and links that can't send parts fail with `BAD_REQUEST`.
- (agent) A call with a file input leaves the batch; batches stay JSON. The handler reads multipart bodies with a streaming `maxBodySize` check, which drains the rest instead of cancelling (Node drops the socket before the 413 otherwise). The OpenAPI handler uses the same reader for forms.
- Why: a download is one request, so the raw body is what browsers, `<a download>` and caches expect. Batches and nested files can't share one body, so they reuse the deferred-stream machinery.
- Lost: one wire shape for every file output.
- (agent) Outputs on the wire: a raw root body carries a `trpc-blob` header (URI-encoded `{ type, name?, lastModified? }`), so the client can tell a file from JSON and rebuild a `Blob` with an empty type. A streamed file is `{ _: '$', type: 'File', value: { stream, name, type, lastModified } }`, its bytes are base64 chunks at `stream`, and the client holds back the frame that holds it until they've all arrived, so the output type stays `File` rather than `Promise<File>`. The same `File` twice in one output streams once.
- Lives in: `packages/trpc/src/transformer/`, `src/server/handler/fetch.ts`, `src/client/links/http/`, `src/openapi/handler.ts`, `src/internal/protocol.ts` (`blobHeaders`, `readBlob`).
