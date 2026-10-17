---
title: Procedures
description: Queries, mutations and subscriptions, with validated input and output.
section: Server
order: 1
---

A procedure is a function the client can call. Build one from `t.procedure` and end it with its type: `.query()` for reads, `.mutation()` for writes, `.subscription()` for a stream of events ([Subscriptions](../subscriptions/overview.md)).

```ts twoslash
// ---cut-start---
import { db, t } from './server.ts';
// ---cut-end---
import { z } from 'zod';

const byId = t.procedure
  .input(z.object({ id: z.string() }))
  .query((opts) => db.post.find(opts.input.id));

const create = t.procedure
  .input(z.object({ title: z.string() }))
  .mutation((opts) => db.post.create(opts.input));
```

A resolver gets `opts`: the validated `input`, the `ctx` ([Context](./context.md)), the procedure's `meta`, `path` and `type`, a `signal` that aborts when the client goes away, a `response` handle ([Responses](./responses.md)) and constructors for its declared `errors` ([Errors](./errors.md)). It can return a value, a promise, an Effect ([Effect](./effect.md)) or a stream ([Streaming](./streaming.md)).

## Input and output

`.input()` and `.output()` take a Standard Schema (Zod, Valibot, ArkType) or an Effect Schema. Several `.input()` calls merge.

```ts twoslash
// ---cut-start---
import { db, PostSchema, t } from './server.ts';
import { z } from 'zod';
// ---cut-end---
const byId = t.procedure
  .input(z.object({ id: z.string() }))
  .output(PostSchema.optional())
  .query((opts) => db.post.find(opts.input.id));
```

The resolver returns the output schema's input type and the client gets its output type, so transforms run on the server. An invalid input fails with a `BAD_REQUEST` error whose `data.issues` lists the problems. It is a typed (`defined`) error, so the client sees the issues in production too ([Errors](./errors.md)).

## Typing without validating

To type and document a result without running the schema, pass `{ validate: false }`. Since no transform runs, the resolver and the client both get the schema's input type, and [OpenAPI](../openapi/routes.md) describes that side:

```ts twoslash
// ---cut-start---
import { db, PostSchema, t } from './server.ts';
// ---cut-end---
const latest = t.procedure
  .output(PostSchema.array(), { validate: false })
  .query(() => db.post.list());
```

## Metadata

`.meta()` attaches data to a procedure that middleware reads as `opts.meta`. Meta keys a root doesn't declare are a type error, so declare them on `initTrpc`:

```ts twoslash
import { initTrpc } from '@trpc12/trpc/server';

const t = initTrpc<{ ctx: {}; meta: { auth?: boolean } }>();

const admin = t.procedure.meta({ auth: true }).query(() => 'secret');
```

A later `.meta()` replaces a key unless its root says how to merge it ([Extensions](./extensions.md)).
