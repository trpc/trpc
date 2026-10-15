# Files: multipart inputs, binary root outputs, streamed nested outputs (human)

- Alex, 2026-10-15 (issues review Q1, proposal Q11.6): "A on openapi but b on rpc unless it's not in a batch".
  - OpenAPI: a root `File` or `Blob` output is the response body.
  - RPC: a `File` or `Blob` can sit anywhere in an output and streams as danSON chunks.
  - An unbatched RPC call whose output is a root `File` or `Blob` gets a raw binary response with `content-type` and `content-disposition`, and the client rebuilds the `File`.
- (agent) Inputs: `File` and `Blob` can sit anywhere in an input. They become `{ _: '$', type: 'File', value: { part, name, type, lastModified } }` markers, with the bytes in multipart parts `0`, `1`, … and the JSON in the `input` field. Only per-call serializers with `parts` know these types, so a JSON body can't claim a file, and links that can't send parts fail with `BAD_REQUEST`.
- (agent) A call with a file input leaves the batch; batches stay JSON. The handler reads multipart bodies with a streaming `maxBodySize` check, which drains the rest instead of cancelling (Node drops the socket before the 413 otherwise). The OpenAPI handler uses the same reader for forms.
- Why: a download is one request, so the raw body is what browsers, `<a download>` and caches expect. Batches and nested files can't share one body, so they reuse the deferred-stream machinery.
- Lost: one wire shape for every file output.
- Lives in: `packages/trpcdev/src/serializer/`, `src/server/fetch.ts`, `src/client/links/http.ts`, `src/openapi/handler.ts`.
