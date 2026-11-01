---
title: Errors
description: One error class, typed on the client from what resolvers return, with or without declarations.
section: Server
order: 4
v11: server/error-handling
---

There is one error class, `TrpcError`. Return `error({ code })` from a resolver or a middleware, or fail with it in Effect code (`Effect.fail(error(…))`, `yield* error(…)`). The procedure's error union is inferred from those, and from a returned `Stream`'s failures ([Streaming](./streaming.md#errors)), with no declaration:

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

An error several procedures share can be a `TrpcError.Tagged` class, which carries its code, `status` and `data` schema. Returning an instance types it like `error()`, and listing the class in `.errors()` declares it:

```ts twoslash
// ---cut-start---
import { db, t } from './server.ts';
// ---cut-end---
import { TrpcError } from '@trpc12/trpc/server';
import { z } from 'zod';

class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
  status: 404,
  data: z.object({ id: z.string() }),
}) {}

const post = t.procedure
  .errors({ POST_NOT_FOUND: PostNotFound })
  .input(z.object({ id: z.string() }))
  .query(
    (opts) =>
      db.post.find(opts.input.id) ?? new PostNotFound({ id: opts.input.id }),
  );
```

The class's name is its `_tag`, and its code unless `code` names another. A class with a built-in code keeps that code's status and its place in `switch (err.code)` and `matchError()`, and Effect code still catches it by its own tag:

```ts
class PostMissing extends TrpcError.Tagged('PostMissing', {
  code: 'NOT_FOUND', // a 404, matchError()'s NOT_FOUND key
  data: z.object({ id: z.string() }),
}) {}
```

## On the client

On the client, the errors in the union are `defined: true`, with their `data`, whether they were returned, failed or declared. A thrown error with a declared code is too: its `data` is validated like a returned one's. Anything else arrives with `defined: false`:

- A thrown error with a built-in code (`throw new TrpcError({ code: 'CONFLICT', data })`) keeps its code and loses its `data`, which no schema checked.
- A thrown error with a custom code keeps its code and `data`, untyped, when the procedure declares no errors. On the client it is an `UndeclaredError`, which `matchError()` hands to `unexpected`. With `.errors()` that don't list it, it is an `INTERNAL_SERVER_ERROR`.
- A crash is an `INTERNAL_SERVER_ERROR`. Its message is masked unless `NODE_ENV` is `development` or `test`, or `exposeUnexpectedErrors: true`.

`onError` still sees the original error, with its own `_tag` ([below](#in-effect-code)). Return a thrown error, or declare it, to make it typed on the client. There is no `errorFormatter`.

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
const appRouter = t.router({
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
});

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

Any string but `unexpected` is a code. The built-in ones (`NOT_FOUND`, `UNAUTHORIZED`, …) have their HTTP status; a custom code is a 400 unless its declaration (`.errors()` or a `TrpcError.Tagged` class) has a `status`. The status is for HTTP: errors don't carry it, and neither do error bodies or socket frames.

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

`unexpected` is the key [`matchError()`](../client/errors.md#handling-every-error) sends every error without a key of its own to, so a defined error with that code would land in the catch-all. Declaring it in `.errors()`, `error()` or a `TrpcError.Tagged` class is a type error that says so:

```ts twoslash
// @errors: 2345
// ---cut-start---
import { t } from './server.ts';
import { error } from '@trpc12/trpc/server';
// ---cut-end---
t.procedure.query(() => error({ code: 'unexpected' }));
```

## In Effect code

Every failure has its own `_tag`, so `Effect.catchTag` takes exactly one out of the error channel. A built-in code's class is tagged with its name (`NOT_FOUND` is `TrpcError.NotFound`, tagged `NotFound`, and so is `error({ code: 'NOT_FOUND' })`), a `TrpcError.Tagged` class with its own, a custom code with the code, and a failure tRPC makes with what went wrong:

```ts
Effect.catchTag('NotFound', () => Effect.succeed(null));
```

`code` still groups them for HTTP: `hasCode(code)` is a refinement, so `Effect.catchIf(hasCode('NOT_FOUND'), …)` takes every `NOT_FOUND`, whatever its tag.

- `ProcedureNotFound` (`NOT_FOUND`): no procedure at the path. Reaches clients with its tag.
- `ProcedureTypeMismatch` (`METHOD_NOT_SUPPORTED`): a query called as a mutation, or the other way. Reaches clients with its tag.
- `TransformerMismatch` (`UNSUPPORTED_PROTOCOL`): a link whose transformer isn't the server's. Made by the link.
- `InvalidInput` (`BAD_REQUEST`): an input that failed its schema. It's defined, with `data.issues`, so it reaches clients with its tag.
- `InvalidOutput` (`INTERNAL_SERVER_ERROR`): an output that failed its schema.
- `RouteNotFound` (`NOT_FOUND`): a URL outside the endpoint, or no OpenAPI route for it.
- `InvalidBody` (`PARSE_ERROR`): a body or `input` that isn't JSON, multipart or a form, or doesn't decode.
- `MissingInputField` (`BAD_REQUEST`): a multipart body without its `input` field.
- `UnreadableBody` (`BAD_REQUEST`): a body or byte stream that failed while it was read.
- `BodyConsumed` (`INTERNAL_SERVER_ERROR`): a body a middleware mounted before tRPC read without keeping it.
- `ByteStreamConsumed` (`BAD_REQUEST`): a byte stream input read a second time.
- `BatchTooLarge` (`PAYLOAD_TOO_LARGE`): a batch with more calls than `batch.maxItems`.
- `BatchingDisabled` (`BAD_REQUEST`): a batch sent to a handler without `batch`.
- `InvalidBatch` (`BAD_REQUEST`): a batch body that isn't an array, or a batched subscription.
- `InvalidPathParam` (`BAD_REQUEST`): an OpenAPI path param that isn't valid, or doesn't fit the body.
- `CrossSiteRequest` (`FORBIDDEN`): a cross-site OpenAPI request without a JSON content type.
- `InvalidMessage` (`PARSE_ERROR`): a socket message that isn't one.
- `UnknownMessage` (`BAD_REQUEST`): a socket message of an unknown type.
- `InvalidRequestId` (`BAD_REQUEST`): a socket request without a unique numeric id.
- `ProcedureNotImplemented` (`NOT_IMPLEMENTED`): a contract procedure without an implementation.
- `UnsupportedResponse` (`BAD_REQUEST`): a `Response`, or a streamed durable replay, over a transport that can't carry it.
- `CallIdConflict` (`CONFLICT`): a call id reused with another input, in `experimental_durable()`.
- `InvalidDurableHeader` (`BAD_REQUEST`): a malformed call id or resume header, in `experimental_durable()`.
- `InvalidConnectionToken` (`UNAUTHORIZED`): a missing, malformed or forged token, in `experimental_connectionToken()`.
- `ConnectionTokenExpired` (`UNAUTHORIZED`): a token past its `ttl`, in `experimental_connectionToken()`.

A failure that is just its code's meaning is that code's class: a body over `maxBodySize` is `PayloadTooLarge`. Clients get the tags of defined errors and the first three above; the rest reach them as their code's class, so the wire carries a tag only where a client [acts on it](../client/errors.md#the-failures-a-client-acts-on). To make one, pass `tag` to the code's class: `new TrpcError.PayloadTooLarge({ tag: 'BatchTooLarge' })` is typed with that tag, and a tag of another code is a type error.

A failure that isn't a `TrpcError` is a type error until it is mapped, so internals never reach clients. `TrpcError.Tagged` classes mark the errors clients may see ([Effect](./effect.md#errors-clients-may-see)).

## Credits

Declared errors with `.errors()` follow [oRPC's typed errors](https://orpc.dev/docs/error-handling).
