# Links and the Effect integration are ratified; public errors are opt-in tagged classes (human)

- Human, 2026-10-15 (decisions round 3, Q20): "C".
- [`links.md`](./links.md) and [`effect-integration.md`](./effect-integration.md) stand as built.
- Effect failures that aren't `TrpcError`s stay a compile error, and a masked `INTERNAL_SERVER_ERROR` at runtime, unless the error class is marked public:

  ```ts twoslash
  // ---cut-start---
  import { TrpcError } from '@trpc12/trpc/server';
  import { Effect, Schema } from 'effect';
  import { z } from 'zod';
  import { db, t } from './server.ts';
  // ---cut-end---
  class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
    data: Schema.Struct({ id: Schema.String }),
  }) {}

  const byId = t.procedure.input(z.object({ id: z.string() })).query((opts) =>
    Effect.gen(function* () {
      const post = db.post.find(opts.input.id);
      if (!post) {
        return yield* new PostNotFound({ id: opts.input.id }); // typed on the client, no mapping
      }
      return post;
    }),
  );
  ```

- A public tagged error is a yieldable Effect error whose `_tag` is its code ([`error-tags.md`](./error-tags.md)). Its status defaults to 400 ([`custom-error-codes.md`](./custom-error-codes.md)), and it is inferred like any other returned error ([`inferred-errors.md`](./inferred-errors.md)).
- (agent) `data` takes any Standard Schema; an Effect `Schema` is the documented form. The schema validates `data` before it is sent; invalid data becomes a masked `INTERNAL_SERVER_ERROR`.
- (agent) The class's statics (`code`, `status`, `message`, `data`) make it an error spec, so `.errors({ POST_NOT_FOUND: PostNotFound })` documents it in OpenAPI. Thrown instances are typed when `.errors()` lists the class's code; otherwise they're untyped like any thrown custom code (an `UndeclaredError`, or a crash when other errors are declared).
- (agent) Before, a thrown instance was `defined: true` even when nothing declared it. A throw has no type, so the client's union didn't list it: `isDefinedError()` let through an error its type said couldn't be there, and `matchError()` gave it to `unexpected`. Now it follows [thrown-errors-and-exhaustive-declarations](./thrown-errors-and-exhaustive-declarations.md), and warns in development like other thrown codes.
- Why: Effect code fails with tagged errors; marking the public ones avoids `catchTag` boilerplate without leaking internals like `SqlError` (query text, causes).
- Lost: passing every tagged error through without marking it.
- Lives in: `packages/trpc/src/internal/error.ts` (`TrpcError.Tagged`, `taggedSpec`), `src/server/execution/execute.ts`; `packages/trpc/src/server/tagged-errors.test.ts`.
