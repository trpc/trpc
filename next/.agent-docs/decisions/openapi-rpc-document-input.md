# The RPC OpenAPI document describes the RPC handler's `?input=`, not per-property query params (agent)

- `experimental_generateOpenApi(router, { target: 'rpc' })` documents a query's or subscription's input as one required `input` query parameter whose `content` is `application/json` with the input's schema: `GET /trpc/post.byId?input={"id":"1"}`, URL-encoded. That's what `httpLink` sends and the only thing `createFetchHandler` reads ([`wire-protocol.md`](./wire-protocol.md)).
- A mutation's body is `{ json: input }`, as before. A mutation without an input now documents a required `application/json` body of `{}`; before, it documented no body, and the handler answered `415`.
- The document changed, not the handler. Found on 2026-10-20 while writing [`open/openapi-rpc-document.md`](../open/openapi-rpc-document.md): the document said `?id=1`, which the handler answered with `400 Input validation failed`.
- Why the document:
  - JSON keeps the input's types (numbers, booleans, `null`, nested objects and arrays); per-property params are strings the handler would have to coerce from the JSON Schema, as the REST handler does.
  - One encoding per call keeps GET URLs canonical (sorted keys), so caches hit, and leaves `input` and `refs` the only reserved names.
  - Apps that want `?id=1` have the REST handler (`route` meta), which documents and serves exactly that.
  - The `415` is the RPC handler's CSRF guard (JSON-only `POST` bodies), so the empty mutation body can't be dropped.
- Why it wasn't caught: the generator's first commit sent the RPC target's GET inputs through the REST branch, and the test written with it asserted that output (`parameters: [{ name: 'id', in: 'query' }]`). The generator and the handlers were tested separately; nothing called a handler with a request built from a document.
- Lost: per-property query params on the RPC endpoint, which some OpenAPI tools render as nicer forms than a JSON parameter.
- Open: an input with a `File` is sent as multipart with `trpc-version`, which the RPC document doesn't describe. A `refs` param for serializers that make refs isn't documented either.
- Lives in: `packages/trpc/src/openapi/generate.ts` (the `target === 'rpc'` branch), the contract test `packages/trpc/src/openapi/document-contract.test.ts` (builds every operation's request from the generated document, both targets, and checks the handler's answer against the documented response), docs in `www/docs/openapi/document.md`.
