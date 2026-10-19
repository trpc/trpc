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

Every built-in code also has a class on `TrpcError`, `new TrpcError.NotFound()`, `new TrpcError.Unauthorized({ message })`, and so on (`PascalCase` of the code). Returned or yielded, it is inferred like `error({ code })`; tRPC builds its own errors (an oversized body, a missing procedure) with the same classes:

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
// ---cut-end---
import { TrpcError } from '@trpc12/trpc/server';

const me = t.procedure.query(
  (opts) => opts.ctx.user ?? new TrpcError.Unauthorized(),
);
```

## Declaring errors

Declaring errors with `.errors()` is optional. It adds typed constructors and `data` schemas. It also types what inference can't see: errors thrown from helpers, since a `throw` has no type.

Once a procedure declares errors, the list is exhaustive. Returning an error it doesn't list, or one whose `data` doesn't match, is a type error (a streamed output's `Stream.fail()` too), and a thrown custom code it doesn't list reaches the client as an `INTERNAL_SERVER_ERROR`. Errors from middleware aren't checked against the list.

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

On the client, the errors in the union are `defined: true`, with their `data`, whether they were returned, failed or declared. A thrown error with a declared code is too: its `data` is validated like a returned one's. Anything else arrives with `defined: false`:

- A thrown error with a built-in code (`throw new TrpcError({ code: 'CONFLICT', data })`) keeps its code and loses its `data`, which no schema checked.
- A thrown error with a custom code keeps its code and `data`, untyped, when the procedure declares no errors. On the client it is an `UndeclaredError`, which `matchError()` hands to `unexpected`. With `.errors()` that don't list it, it is an `INTERNAL_SERVER_ERROR`.
- A crash is an `INTERNAL_SERVER_ERROR`. Its message is masked unless `NODE_ENV` is `development` or `test`, or `exposeUnexpectedErrors: true`.

`onError` still sees the original error. Return a thrown error, or declare it, to make it typed on the client. There is no `errorFormatter`.

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
// ---cut-end---
import { matchError, safe } from '@trpc12/trpc/client';

const [post, err] = await safe(client.post.byId.query({ id: '1' }));
if (err) {
  matchError(err, {
    NOT_FOUND: (e) => console.log(e.data),
    //                              ^?
    BAD_REQUEST: (e) => console.log(e.data.issues),
    NETWORK_ERROR: () => console.log('offline'),
    BAD_RESPONSE: (e) => console.log(e.message),
    STREAM_INTERRUPTED: (e) => console.log(e.message),
    unexpected: (e) => console.log(e.code), // crashes, aborts, thrown errors
  });
}
```

### When a procedure adds an error

`post.byId` returns `NOT_FOUND`, and the client's `matchError()` handles it. When the procedure also starts returning `FORBIDDEN`, that `matchError()` stops compiling until it has a `FORBIDDEN` handler:

```ts twoslash
// @errors: 2345
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  matchError,
  routerType,
  safe,
} from '@trpc12/trpc/client';
import { error } from '@trpc12/trpc/server';
import { z } from 'zod';
import { db, t } from './server.ts';
declare const url: string;
// ---cut-end---
const appRouter = {
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query((opts) => {
      const post = db.post.find(opts.input.id);
      if (!post) {
        return error({ code: 'NOT_FOUND', data: { id: opts.input.id } });
      }
      if (post.author !== opts.ctx.user?.name) {
        return error({ code: 'FORBIDDEN' });
      }
      return post;
    }),
  },
};

// ---cut-start---
const client = createTrpcClient({
  router: routerType<typeof appRouter>(),
  links: [httpLink({ url })],
});
// ---cut-end---
const [, err] = await safe(client.post.byId.query({ id: '1' }));
if (err) {
  matchError(err, {
    NOT_FOUND: (e) => `No post ${e.data.id}`,
    BAD_REQUEST: (e) => e.data.issues[0]?.message ?? 'Invalid id',
    NETWORK_ERROR: () => 'You are offline',
    BAD_RESPONSE: () => 'Try again later',
    STREAM_INTERRUPTED: () => 'Try again later',
    unexpected: (e) => e.message,
  });
}
```

Removing an error makes its handler left over, which is a type error too. Adding a code to `.errors()` works the same. A thrown error changes no type, so the client compiles and the error reaches `unexpected`. [When the links change](../client/errors.md#when-the-links-change) is the same for a link's codes.

See [Errors without try/catch](../client/errors.md) for `safe()`, `matchError()` and the built-in codes.

## Thrown errors

v11 code throws its errors (`throw new TRPCError({ code })`). In v12 that still works, but a thrown error is untyped on the client, so return it instead: `return error({ code })`, or `yield*` it in an Effect. When `NODE_ENV` is `development`, a procedure that throws a `TrpcError` it could return logs a warning, once per procedure and code. Errors with a declared code, from its constructor (`opts.errors.NOT_FOUND()`), a `TrpcError.Tagged` class or `new TrpcError()`, are typed, so they don't warn; a thrown `TrpcError.Tagged` class nothing declares is untyped like any other thrown code. A thrown code that `.errors()` doesn't list always warns in development, since it becomes an `INTERNAL_SERVER_ERROR`.

Turn the warning off for every procedure of a root:

```ts
const t = initTrpc({ warnThrownErrors: false });
```

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
