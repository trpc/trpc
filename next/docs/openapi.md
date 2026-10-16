# OpenAPI

`trpcdev/openapi` serves the same router over REST, generates an OpenAPI 3.1 document from its schemas, and calls REST endpoints with the tRPC client. RPC and REST run side by side; neither changes the other.

## Routes

The `openapi()` root extension adds a `route` meta key. A procedure without one is served at its path: `GET /api/post/byId` for queries, `POST /api/post/create` for mutations. `route` picks the method, path and status.

```ts
import { openapi } from 'trpcdev/openapi';

const t = initTrpc<{ ctx: Context }>().with(openapi());

const byId = t.procedure
  .meta({ route: { method: 'GET', path: '/posts/{id}', tags: ['posts'] } })
  .input(z.object({ id: z.string() }))
  .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
  .query(…);

const create = t.procedure
  .meta({ route: { method: 'POST', path: '/posts', successStatus: 201 } })
  .input(z.object({ title: z.string().min(1) }))
  .mutation(…);
```

`route` also takes `summary`, `description`, `deprecated` and `operationId`. When two paths match, the one with more leading static segments wins: `/posts/latest` before `/posts/{id}`.

`spec` overrides the generated operation in the document: an object replaces it, a function extends it. Later `.meta({ route })` calls merge into earlier ones key by key, and `spec` functions compose, so a base procedure can add `security` and its procedures add more:

```ts
const authed = t.procedure
  .use(requireUser)
  .meta({ route: { spec: (op) => ({ ...op, security: [{ bearer: [] }] }) } });

const me = authed
  .meta({
    route: { path: '/me', spec: (op) => ({ ...op, 'x-internal': true }) },
  })
  .query(({ ctx }) => ctx.user);
```

`spec` only changes the document (`target: 'openapi'`); `toContract()` leaves it out.

## The handler

```ts
import { cors } from 'trpcdev/http';
import { createOpenApiHandler, openApiReference } from 'trpcdev/openapi';

const openapi = createOpenApiHandler({
  router: appRouter,
  createContext,
  layer,
  middleware: [
    cors(),
    openApiReference({
      router: appRouter,
      specGenerateOptions: { info: { title: 'API', version: '1.0.0' } },
    }),
  ],
});
// GET /api/posts/1, GET /api/docs (Scalar), GET /api/openapi.json
```

`prefix` defaults to `/api`. Like the RPC handler, it has `fetch(request)` and `dispose()`, and `middleware` takes Effect HTTP middleware, outermost first.

`openApiReference()` is middleware too, so it also works on `createFetchHandler` or any `effect/http` app. It answers `GET /api/docs` and `GET /api/openapi.json` and passes other requests through:

- `docsProvider: 'swagger'` serves Swagger UI instead of Scalar; `path` and `specPath` move the two pages.
- `{ router, specGenerateOptions }` generates the document on the first request. `{ document }` serves one you built, e.g. with the TypeScript generator below; it can be a function.
- Without `servers`, the document lists the request's origin.

## Input

With the default `inputStructure: 'compact'`, path params merge with the query string (`GET`) or the body into one input.

- Query strings and forms use bracket notation (`?tags[]=a&author[name]=x`) and are coerced by the input's JSON Schema, so `?limit=10&published=true` gives a number and a boolean.
- JSON bodies are taken as they are.
- `multipart/form-data` fields can hold `File`s.

`inputStructure: 'detailed'` passes `{ params, query, headers, body }`, each with its own schema. `outputStructure: 'detailed'` lets the resolver return `{ status?, headers?, body }`.

```ts
const update = t.procedure
  .meta({ route: { method: 'PATCH', path: '/posts/{id}', inputStructure: 'detailed', outputStructure: 'detailed' } })
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

### From the types

`generateOpenApi` only sees runtime schemas. `unstable_generateOpenApiFromTypes` from `trpcdev/openapi/typescript` also reads the router's types with the TypeScript 7 compiler, so it documents:

- errors that are only inferred (returned with `error()`, failed or yielded in an Effect), never declared, with their status: a `TrpcError.Tagged` class's literal `status`, the built-in code's status, or `400`;
- the input and output of procedures without static schemas (no `.output()`, or a ctx-callback input).

```ts
// scripts/openapi.ts, run at build time
import { unstable_generateOpenApiFromTypes } from 'trpcdev/openapi/typescript';
import { appRouter } from '../src/router.ts';

const doc = await unstable_generateOpenApiFromTypes(appRouter, {
  file: new URL('../src/router.ts', import.meta.url),
  exportName: 'appRouter', // the default
  info: { title: 'API', version: '1.0.0' },
});
await fs.writeFile('openapi.json', JSON.stringify(doc, null, 2));

// server
import doc from './openapi.json' with { type: 'json' };
openApiReference({ document: doc as OpenApiDocument });
```

Where a procedure has a runtime schema, that schema wins, so the two generators agree. Types become JSON Schema the way `JSON.stringify` sends them:

- `Date` is a `date-time` string, and `toJSON()` is followed.
- Functions, symbols, `bigint` and `undefined` are left out; optional properties aren't `required`.
- Branded primitives (`string & { __brand }`) are their primitive.
- Recursive types become `components.schemas`.
- JSDoc comments become `description`s.

`typescript` (7.x) is an optional peer dependency, needed only where this runs. `tsconfig` picks the project; it defaults to the nearest one that includes `file`.

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
      headers: { 'x-user': 'ada' },
    }),
  ],
});

await client.post.byId.query({ id: '1' }); // GET https://api.example.com/api/posts/1
```

Declared errors come back as typed `TrpcError`s, as they do over RPC.

REST responses are plain JSON, and the client types say so: a `createdAt: Date` output is a `string` through `openApiLink`. To get the types back, put `validationLink({ contract, output: 'json' })` in front: it decodes each result with the Effect Schema's JSON codec, and the client types results as the schemas' types again ([Client](./client.md#validating-on-the-client)):

```ts
links: [
  validationLink({ contract: appContract, output: 'json' }),
  openApiLink({ url, contract: toContract(appContract) }),
];
```

## A contract from an OpenAPI document

`generateContractFromOpenApi(document, { prefix?, exportName?, patterns? })` turns an OpenAPI 3.0 or 3.1 document into the source of a `trpcdev/contract` module. Schemas are Effect Schemas, translated by Effect's `SchemaRepresentation`; each operation becomes a procedure with its `.route()`, so the contract works with `openApiLink` and `validationLink` against any REST API:

```ts
import { generateContractFromOpenApi } from 'trpcdev/openapi';

const document = await (
  await fetch('https://petstore.example/openapi.json')
).json();
await writeFile(
  'src/petstore.ts',
  generateContractFromOpenApi(document, { exportName: 'petstore' }),
);
```

```ts
// src/petstore.ts (generated)
export const Pet = Schema.Struct({
  id: Schema.Number.check(Schema.isInt()),
  name: Schema.String,
});
const c = trpcContract.create().with(openapi());
export const petstore = {
  pets: {
    list: c
      .input(PetsListInput)
      .output(PetsListOutput)
      .meta({ route: { method: 'GET', path: '/pets' } })
      .query(),
  },
};
```

- Procedure paths come from `operationId`s, with dots nesting (`pets.list`); without one, from the method and path (`deletePetsPetId`).
- `GET` is a query, a `text/event-stream` response a subscription, anything else a mutation. The first 2xx status becomes `successStatus`.
- Path and query parameters merge with the JSON body into one input, like `inputStructure: 'compact'`.
- Objects that don't mention `additionalProperties` become closed structs (extra keys are still ignored when decoding), except where `allOf` merges them.
- Error responses in trpcdev's own shape (`code` and `data`) become `.errors()`, so a document from `generateOpenApi` round-trips with typed errors. Other APIs' errors stay unexpected errors.
- `pattern`s are ignored unless `patterns: 'apply'`; only use that with documents you trust.

## NestJS

`@trpcdev/nest` serves a contract from Nest controllers. `@Implement(contract)` adds the Nest route for the contract's REST mapping; the method returns the procedure, so the controller's injected services reach the resolver through `this`.

```ts
import { Implement, TrpcModule } from '@trpcdev/nest';

const impl = t.implement(appContract);

@Controller()
class PostController {
  constructor(@Inject(Posts) private readonly posts: Posts) {}

  @Implement(appContract.post.byId) // .meta({ route: { method: 'GET', path: '/posts/{id}' } })
  byId() {
    return impl.post.byId.query(
      ({ input, errors }) =>
        this.posts.find(input.id) ??
        errors.NOT_FOUND({ data: { id: input.id } }),
    );
  }
}

@Module({
  imports: [
    TrpcModule.forRoot({
      createContext: ({ platform }) => ({
        user: platform.switchToHttp().getRequest().user,
      }),
      layer: Db.layer,
    }),
  ],
  controllers: [PostController],
  providers: [Posts],
})
class AppModule {}
```

- A leaf needs a route `path`, `.meta({ route: { path } })`. Pass a contract router instead and return `impl.router({ … })` (or a plain object of procedures) to get default paths from the keys below it (`/post/byId`).
- `TrpcModule.forRoot()` takes the OpenAPI handler's options; `createContext`'s `platform` is Nest's `ExecutionContext`. `forRootAsync({ inject, useFactory })` builds them from providers. One handler serves every route, so the `layer` is built once and released on shutdown (`app.enableShutdownHooks()` or `app.close()`).
- Guards, pipes and filters run as usual; put `@Implement` above the method's other decorators so they apply to every route it adds. The procedure's own middleware and validation run after them, and errors use the REST shape above.
- Bodies Nest's JSON and urlencoded parsers read are used as parsed; others are read from the request.
- Express only. Nest needs `experimentalDecorators`.
