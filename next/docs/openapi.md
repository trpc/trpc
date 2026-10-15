# OpenAPI

`trpcdev/openapi` serves the same router over REST, generates an OpenAPI 3.1 document from its schemas, and calls REST endpoints with the tRPC client. RPC and REST run side by side; neither changes the other.

## Routes

A procedure without `.route()` is served at its path: `GET /api/post/byId` for queries, `POST /api/post/create` for mutations. `.route()` picks the method, path and status.

```ts
const byId = t.procedure
  .route({ method: 'GET', path: '/posts/{id}', tags: ['posts'] })
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
  .query(…);

const create = t.procedure
  .route({ method: 'POST', path: '/posts', successStatus: 201 })
  .input(z.object({ title: z.string().min(1) }))
  .mutation(…);
```

`.route()` also takes `summary`, `description`, `deprecated` and `operationId`. When two paths match, the one with more leading static segments wins: `/posts/latest` before `/posts/{id}`.

## The handler

```ts
import { createOpenApiHandler, openApiReference } from 'trpcdev/openapi';

const openapi = createOpenApiHandler({
  router: appRouter,
  createContext,
  layer,
  plugins: [
    openApiReference({
      specGenerateOptions: { info: { title: 'API', version: '1.0.0' } },
    }),
  ],
});
// GET /api/posts/1, GET /api/docs (Scalar), GET /api/openapi.json
```

`prefix` defaults to `/api`. `openApiReference({ docsProvider: 'swagger' })` serves Swagger UI instead; `path` and `specPath` move the two pages. Like the RPC handler, it has `fetch(request)` and `dispose()`.

## Input

With the default `inputStructure: 'compact'`, path params merge with the query string (`GET`) or the body into one input.

- Query strings and forms use bracket notation (`?tags[]=a&author[name]=x`) and are coerced by the input's JSON Schema, so `?limit=10&published=true` gives a number and a boolean.
- JSON bodies are taken as they are.
- `multipart/form-data` fields can hold `File`s.

`inputStructure: 'detailed'` passes `{ params, query, headers, body }`, each with its own schema. `outputStructure: 'detailed'` lets the resolver return `{ status?, headers?, body }`.

```ts
const update = t.procedure
  .route({ method: 'PATCH', path: '/posts/{id}', inputStructure: 'detailed', outputStructure: 'detailed' })
  .input(z.object({
    params: z.object({ id: z.string() }),
    headers: z.object({ 'if-match': z.string() }),
    body: z.object({ title: z.string() }),
  }))
  .mutation(({ input }) => ({ headers: { etag: '…' }, body: … }));
```

## Output and errors

- The output is the JSON body. A `Blob` or `File` output is sent as the body. Promises and async iterables inside an output aren't supported over REST.
- Set `response.status = 204` in a resolver to send no body.
- Declared errors use their status: `404 { defined: true, code: 'NOT_FOUND', status, message, data }`. Invalid input is a `400` with `issues`.
- Unexpected errors are masked as `500 Internal server error` unless `exposeUnexpectedErrors` is on. It defaults to on only in development and test.
- Subscriptions are `text/event-stream` and resume from `Last-Event-ID`.

## Groups and lazy subtrees

`t.router({ prefix, tags }, routes)` prefixes and tags every route below it, for OpenAPI only. A `lazy()` subtree's `prefix` does the same. See [Routers](./routers.md).

The handler loads unprefixed lazy subtrees at startup, and a prefixed one on the first request under its prefix. Pass a contract so every route is known up front and each subtree loads on its first request, whatever its prefix:

```ts
// build step
const contract = toContract(await loadRouter(appRouter));

// server
createOpenApiHandler({ router: appRouter, contract });
```

## The document

```ts
import { generateOpenApi } from 'trpcdev/openapi';
import { loadRouter } from 'trpcdev/server';

const doc = generateOpenApi(await loadRouter(appRouter), {
  info: { title: 'API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
});
```

The document has schemas for input, output and each declared error. `filter({ path, procedure })` drops operations. `target: 'rpc'` describes the RPC endpoint instead of the REST routes. `generateOpenApi` throws on a lazy subtree that hasn't loaded, so pass the result of `loadRouter()`.

An output declared with `.output(schema, { validate: false })` isn't validated. The document then describes the schema's input side, which is what the resolver returns.

## Calling REST from the client

`openApiLink` sends each call to its REST route. It needs the routes, so it takes a contract; it never needs the router.

```ts
import { toContract } from 'trpcdev/contract';
import { openApiLink } from 'trpcdev/openapi';

const contract = toContract(appRouter); // or the JSON, shipped to the client
const client = createTrpcClient({
  router: contract,
  links: [
    openApiLink({
      url: 'https://api.example.com',
      contract,
      headers: { 'x-user': 'alex' },
    }),
  ],
});

await client.post.byId.query({ id: '1' }); // GET https://api.example.com/api/posts/1
```

Declared errors come back as typed `TrpcError`s, as they do over RPC.
