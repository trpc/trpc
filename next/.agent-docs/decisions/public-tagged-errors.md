# Links and the Effect integration are ratified; public errors are opt-in tagged classes (human)

- Alex, 2026-10-15 (decisions round 3, Q20): "C".
- [`links.md`](./links.md) and [`effect-integration.md`](./effect-integration.md) stand as built.
- Effect failures that aren't `TrpcError`s stay a compile error, and a masked `INTERNAL_SERVER_ERROR` at runtime, unless the error class is marked public:

  ```ts
  class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
    data: Schema.Struct({ id: Schema.String }),
  }) {}

  yield * new PostNotFound({ id }); // typed on the client, no mapping
  ```

- A public tagged error is a yieldable Effect error whose `_tag` is its code ([`error-tags.md`](./error-tags.md)). Its status defaults to 400 ([`custom-error-codes.md`](./custom-error-codes.md)), and it is inferred like any other returned error ([`inferred-errors.md`](./inferred-errors.md)).
- (agent) `data` takes any Standard Schema; an Effect `Schema` is the documented form. The schema also serves OpenAPI and validates `data` before it is sent.
- Why: Effect code fails with tagged errors; marking the public ones avoids `catchTag` boilerplate without leaking internals like `SqlError` (query text, causes).
- Lost: passing every tagged error through without marking it.
- Lives in: `packages/trpcdev/src/internal/error.ts`, `src/server/execute.ts` (not built yet).
