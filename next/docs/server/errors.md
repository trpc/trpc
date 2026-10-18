---
title: Errors
description: One error class, typed on the client from what resolvers return, with or without declarations.
section: Server
order: 4
v11: server/error-handling
---

There is one error class, `TrpcError`. Return `error({ code })` from a resolver or a middleware, or fail with it in Effect code (`Effect.fail(error(…))`, `yield* error(…)`). The procedure's error union is inferred from those, with no declaration:

```ts twoslash
// ---cut-start---
import { db, t } from './server.ts';
// ---cut-end---
import { error } from '@trpc12/trpc/server';
import { z } from 'zod';

const byId = t.procedure
  .input(z.object({ id: z.string() }))
  .query(
    (opts) =>
      db.post.find(opts.input.id) ??
      error({ code: 'NOT_FOUND', data: { id: opts.input.id } }),
  );
```

## Declaring errors

Declaring errors with `.errors()` is optional. It adds typed constructors, `data` schemas and entries in `generateOpenApi`'s document. It also types what inference can't see: errors thrown from helpers (a `throw` has no type) and contracts, which have no resolver. `experimental_generateOpenApiFromTypes` documents inferred errors without declarations ([The document](../openapi/document.md)).

```ts twoslash
// ---cut-start---
import { db, t } from './server.ts';
// ---cut-end---
import { z } from 'zod';

const byId = t.procedure
  .errors({
    NOT_FOUND: { data: z.object({ id: z.string() }) },
    GONE: { status: 410, message: 'This post was removed' },
  })
  .input(z.object({ id: z.string() }))
  .query(
    (opts) =>
      db.post.find(opts.input.id) ??
      opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
  );
```

## On the client

On the client, `error.defined` is true for errors in the union, whether returned, failed or declared (narrow on `code` next). It is false for anything else: undeclared thrown errors, network failures, aborts. Unexpected errors' messages are masked unless `NODE_ENV` is `development` or `test`, or `exposeUnexpectedErrors: true`. There is no `errorFormatter`.

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
// ---cut-end---
import { safe } from '@trpc12/trpc/client';

const [post, err] = await safe(client.post.byId.query({ id: '1' }));
if (err?.defined && err.code === 'NOT_FOUND') {
  console.log(err.data);
  //              ^?
}
```

See [Errors without try/catch](../client/errors.md) for `safe()` and `createSafeClient()`.

## Codes and statuses

Any string is a code. The built-in ones (`NOT_FOUND`, `UNAUTHORIZED`, …) have their HTTP status; a custom code is a 400 unless its declaration (`.errors()` or a `TrpcError.Tagged` class) has a `status`. The status is for HTTP: errors don't carry it, and neither do error bodies or socket frames.

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
import { error } from '@trpc12/trpc/server';
// ---cut-end---
t.procedure
  .errors({ OUT_OF_STOCK: { status: 409 } })
  .mutation(() => error({ code: 'OUT_OF_STOCK' })); // 409

t.procedure.mutation(() => error({ code: 'OUT_OF_STOCK' })); // 400
```

## In Effect code

An error's `_tag` is its code, so Effect code narrows with `catchTag`:

```ts
Effect.catchTag('NOT_FOUND', () => Effect.succeed(null));
```

A failure that isn't a `TrpcError` is a type error until it is mapped, so internals never reach clients. `TrpcError.Tagged` classes mark the errors clients may see ([Effect](./effect.md#errors-clients-may-see)).

## Credits

Declared errors with `.errors()` follow [oRPC's typed errors](https://orpc.dev/docs/error-handling).
