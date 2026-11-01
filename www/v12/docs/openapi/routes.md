---
title: REST routes
description: 'Serve the same router over REST: route `meta`, the handler, inputs, outputs and groups.'
section: Contracts and OpenAPI
order: 2
experiment: contracts
---

A procedure gets a REST route from its `route` meta, and `experimental_createOpenApiHandler` serves the routes next to the RPC handler ([OpenAPI](./overview.md)).

## Route `meta`

The `experimental_openapi()` root extension adds a `route` meta key. A procedure without one is served at its path: `GET /api/post/byId` for queries, `POST /api/post/create` for mutations. `route` picks the method, path and status.

```ts twoslash
// ---cut-start---
import { db, type Context } from './server.ts';
import { initTrpc } from '@trpc12/trpc/server';
// ---cut-end---
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { z } from 'zod';

const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());

const byId = t.procedure
  .meta({ route: { method: 'GET', path: '/posts/{id}', tags: ['posts'] } })
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
  .query(
    (opts) =>
      db.post.find(opts.input.id) ??
      opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
  );

const create = t.procedure
  .meta({ route: { method: 'POST', path: '/posts', successStatus: 201 } })
  .input(z.object({ title: z.string().min(1) }))
  .mutation((opts) => db.post.create(opts.input));
```

`route` also takes `summary`, `description`, `deprecated` and `operationId`. When two paths match, the one with more leading static segments wins: `/posts/latest` before `/posts/{id}`.

`spec` overrides the generated operation in the document: an object replaces it, a function extends it. Later `.meta({ route })` calls merge into earlier ones key by key, and `spec` functions compose, so a base procedure can add `security` and its procedures add more. Declare the `bearer` scheme in the document's `components.securitySchemes` ([security and tags](./document.md#security-and-tags)):

```ts twoslash
// ---cut-start---
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { error, initTrpc } from '@trpc12/trpc/server';
import type { Context } from './server.ts';
const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());
const requireUser = t.middleware((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);
// ---cut-end---
const authed = t.procedure
  .use(requireUser)
  .meta({ route: { spec: (op) => ({ ...op, security: [{ bearer: [] }] }) } });

const me = authed
  .meta({
    route: { path: '/me', spec: (op) => ({ ...op, 'x-internal': true }) },
  })
  .query((opts) => opts.ctx.user);
```

`spec` only changes the document (`target: 'openapi'`); `experimental_toContract()` leaves it out.

## The handler

```ts twoslash
// ---cut-start---
import type { Layer } from 'effect';
import { appRouter, type Context } from './server.ts';
declare function createContext(): Context;
declare const layer: Layer.Layer<never>;
// ---cut-end---
import { cors } from '@trpc12/trpc/http';
import {
  experimental_createOpenApiHandler,
  experimental_openApiReference,
} from '@trpc12/trpc/openapi';

const openapi = experimental_createOpenApiHandler({
  router: appRouter,
  createContext,
  layer,
  middleware: [
    cors(),
    experimental_openApiReference({
      router: appRouter,
      specGenerateOptions: { info: { title: 'API', version: '1.0.0' } },
    }),
  ],
});
// GET /api/posts/1, GET /api/docs (Scalar), GET /api/openapi.json
```

`prefix` defaults to `/api`. Like the RPC handler, it has `fetch(request)` and `dispose()`, and `middleware` takes Effect HTTP middleware, outermost first.

`experimental_openApiReference()` is middleware too, so it also works on `createFetchHandler` or any `effect/http` app. It answers `GET /api/docs` and `GET /api/openapi.json` and passes other requests through:

- `docsProvider: 'swagger'` serves Swagger UI instead of Scalar; `path` and `specPath` move the two pages.
- `{ router, specGenerateOptions }` generates the document on the first request. `{ document }` serves one you built, e.g. with the TypeScript generator below; it can be a function.
- Without `servers`, the document lists the request's origin.

### Cross-site forms

The handler refuses requests from another origin that use a method other than `GET`, `HEAD` or `OPTIONS` with a body that isn't `application/json` or `application/octet-stream`, answering `403 FORBIDDEN`. A form or a `no-cors` `fetch` on another site can send a urlencoded, multipart or `text/plain` body (or none) without a CORS preflight, and the browser attaches the user's cookies. JSON and `application/octet-stream` bodies need a preflight, so [`cors()`](../adapters/overview.md#middleware-and-cors) decides those requests.

- `Sec-Fetch-Site` decides: `same-origin` and `none` pass, while `same-site` and `cross-site` don't, so a sibling subdomain counts as another origin. Browsers from before 2023 don't send that header; for them, the `Origin` header must name the request's host.
- A request with neither header (from `curl` or a server) passes.
- `csrf: { trustedOrigins: ['https://www.example.com'] }` lets that origin's forms through. `csrf: false` turns the guard off.

## Input

With the default `inputStructure: 'compact'`, path params merge with the query string (`GET`) or the body into one input.

- Query strings and forms use bracket notation (`?tags[]=a&author[name]=x`) and are coerced by the input's JSON Schema, so `?limit=10&published=true` gives a number and a boolean.
- JSON bodies are taken as they are.
- `multipart/form-data` fields can hold `File`s. The document describes a body with a `z.file()`, `z.instanceof(File)` or `z.instanceof(Blob)` in it as `multipart/form-data`, with the file as `format: binary`, so generated clients send a form. Repeat a field for an array; one value for an array field is an array of one.
- An [`experimental_byteStream()`](../server/byte-streams.md#over-openapi) input is the `application/octet-stream` body, read as it arrives. Only the whole input or a detailed input's `body` can be one, so a route with path params needs `inputStructure: 'detailed'`.
- Forms from another origin are refused unless it's trusted ([Cross-site forms](#cross-site-forms)).

`inputStructure: 'detailed'` passes `{ params, query, headers, body }`, each with its own schema. `outputStructure: 'detailed'` lets the resolver return `{ status?, headers?, body }`.

```ts
const update = t.procedure
  .meta({
    route: {
      method: 'PATCH',
      path: '/posts/{id}',
      inputStructure: 'detailed',
      outputStructure: 'detailed',
    },
  })
  .input(
    z.object({
      params: z.object({ id: z.string() }),
      headers: z.object({ 'if-match': z.string() }),
      body: z.object({ title: z.string() }),
    }),
  )
  .mutation((opts) => ({ headers: { etag: '…' }, body: savePost(opts.input) }));
```

## Output and errors

- The output is the JSON body. A `Blob` or `File` output is sent as the body. Promises and async iterables inside an output aren't supported over REST.
- Set `response.status = 204` in a resolver to send no body.
- Declared errors use their declared status, or their code's: `404 { defined: true, code: 'NOT_FOUND', message, data }`. The body has no `status`; the response's status is it. Invalid input is a `400` with `issues`.
- Unexpected errors are masked as `500 Internal server error` unless `exposeUnexpectedErrors` is on. It defaults to on only in development and test.
- Subscriptions are `text/event-stream` and resume from `Last-Event-ID`.

## Groups and lazy subtrees

Under the `experimental_openapi()` extension, `t.router({ meta: { route: { prefix, tags } } }, routes)` groups routes for OpenAPI. Types and RPC paths don't change, and it takes no middleware.

```ts twoslash
// ---cut-start---
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import type { Context } from './server.ts';
// ---cut-end---
const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());
// ---cut-start---
const users = t.procedure.query(() => [{ id: '1', name: 'Ada' }]);
const ban = t.procedure.mutation(() => {});
// ---cut-end---

const appRouter = t.router({
  admin: t.router(
    { meta: { route: { prefix: '/staff', tags: ['admin'] } } },
    { users, ban },
  ),
});
// RPC: admin.users. OpenAPI: GET /api/staff/users, tagged admin.
```

The prefix goes before every route below the group: before an explicit `.meta({ route: { path } })`, and before the path derived from the keys below the group. Group tags come before a procedure's own. Groups nest, and a group passed as the root router applies to every route.

`mergeRouters(admin, other)` keeps the group: every route of the result is in it, `other`'s too. Merging two groups with different `route` throws; nest them instead ([Routers](../server/routers.md)). Object spread (`{ ...admin }`) drops the group.

A router's `meta` takes only the keys an extension gives a router-level form, like `route`; other `meta` is set on procedures.

A `t.lazy(load, { meta: { route: { prefix } } })` subtree is scoped the same way ([Lazy subtrees](../server/routers.md#lazy-subtrees)).

The handler loads unprefixed lazy subtrees at startup, and a prefixed one on the first request under its prefix. Pass a contract so every route is known up front and each subtree loads on its first request, whatever its prefix:

```ts twoslash
// ---cut-start---
import { experimental_toContract } from '@trpc12/trpc/contract';
import { experimental_createOpenApiHandler } from '@trpc12/trpc/openapi';
import { initTrpc, loadRouter } from '@trpc12/trpc/server';
const t = initTrpc();
const appRouter = t.router({ health: t.procedure.query(() => 'ok') });
// ---cut-end---
// build step
const contract = experimental_toContract(await loadRouter(appRouter));

// server
experimental_createOpenApiHandler({ router: appRouter, contract });
```

## Credits

The REST mapping follows oRPC's OpenAPI support: every procedure served with no configuration ([routing](https://orpc.dev/docs/openapi/routing)), [bracket notation](https://orpc.dev/docs/openapi/bracket-notation) and [coercion from the schema](https://orpc.dev/docs/plugins/smart-coercion).
