---
title: The document
description: Generate an OpenAPI 3.1 document from the router's schemas, or from its types.
section: Contracts and OpenAPI
order: 3
v11: openapi
experiment: contracts
---

```ts twoslash
// ---cut-start---
import { appRouter } from './server.ts';
// ---cut-end---
import { experimental_generateOpenApi } from '@trpc12/trpc/openapi';
import { loadRouter } from '@trpc12/trpc/server';

const doc = experimental_generateOpenApi(await loadRouter(appRouter), {
  info: { title: 'API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
});
```

The document has schemas for input, output and each declared error. Each error's `code` is a constant. The `default` response covers the rest: untyped errors (`defined: false`, the `TrpcUntypedError` schema) and typed errors with any other built-in code. So a generated client narrows `error.defined && error.code === 'NOT_FOUND'` to the declared `NOT_FOUND` and its `data`. A zod `z.date()` output is a `date-time` string, as `JSON.stringify` sends it, and so is a `z.coerce.date()` input; a plain `z.date()` input rejects strings, so it stays `{}`. `filter({ path, procedure })` drops operations. `target: 'rpc'` describes the RPC endpoint instead of the REST routes. `experimental_generateOpenApi` throws on a lazy subtree that hasn't loaded, so pass the result of `loadRouter()`.

With `target: 'rpc'`, the document describes requests as `httpLink` sends them. A query or subscription is a `GET` with one `input` query parameter holding the input as JSON (`/trpc/post.byId?input={"id":"1"}`, URL-encoded; [Query URLs](../client/links/http.md#query-urls)). A mutation is a `POST` with an `application/json` body of `{ "json": input }`, or `{}` without an input. Responses are wrapped the same way, in `{ "json": … }`.

An [`experimental_byteStream()`](../server/byte-streams.md#over-openapi) input, or a detailed input's `body` that is one, is an `application/octet-stream` body with the schema `{ type: 'string', format: 'binary' }`. `target: 'rpc'` documents it as a `POST` with the `trpc-version` header the RPC handler needs, and leaves out procedures whose stream is a detailed input's `body`, which only REST can send.

## Security and tags

`components.securitySchemes` declares how clients authenticate, and `security` says which schemes every operation needs. Docs UIs show a login form for them, and generated clients attach the credentials ([Generating a client with Hey API](./hey-api.md)). A procedure's `route.spec` overrides it, with `security: []` for a public route. `tags` describes the tags routes use, in the order docs UIs list them.

```ts twoslash
// ---cut-start---
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
const t = initTrpc().concat(experimental_openapi());
// ---cut-end---
import { experimental_generateOpenApi } from '@trpc12/trpc/openapi';

const router = t.router({
  me: t.procedure
    .meta({ route: { tags: ['users'] } })
    .query(() => ({ name: 'Ada' })),
  health: t.procedure
    .meta({ route: { spec: (op) => ({ ...op, security: [] }) } })
    .query(() => 'ok'),
});

const doc = experimental_generateOpenApi(router, {
  info: { title: 'API', version: '1.0.0' },
  components: {
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
  },
  security: [{ bearer: [] }],
  tags: [{ name: 'users', description: 'Accounts and sessions' }],
});
```

## From the types

`experimental_generateOpenApi` only sees runtime schemas. `experimental_generateOpenApiFromTypes` from `@trpc12/trpc/openapi/typescript` also reads the router's types with the TypeScript 7.1 compiler API (it needs `typescript` 7.1 or later installed), so it documents:

- errors that are only inferred (returned with `error()`, failed or yielded in an Effect), never declared, with their status: a `TrpcError.Tagged` class's literal `status`, the built-in code's status, or `400`;
- the input and output of procedures without static schemas (no `.output()`, or a ctx-callback input).

```ts twoslash
// ---cut-start---
// @resolveJsonModule: true
// @filename: src/router.ts
export { appRouter } from '../server.ts';
// @filename: openapi.json
{ "openapi": "3.1.0", "info": { "title": "API", "version": "1.0.0" }, "paths": {} }
// @filename: scripts/openapi.ts
import * as fs from 'node:fs/promises';
// ---cut-end---
// scripts/openapi.ts, run at build time
import { experimental_generateOpenApiFromTypes } from '@trpc12/trpc/openapi/typescript';
import { appRouter } from '../src/router.ts';

const doc = await experimental_generateOpenApiFromTypes(appRouter, {
  file: new URL('../src/router.ts', import.meta.url),
  exportName: 'appRouter', // the default
  info: { title: 'API', version: '1.0.0' },
});
await fs.writeFile('openapi.json', JSON.stringify(doc, null, 2));

// ---cut-start---
// @filename: app.ts
import { experimental_openApiReference, type OpenApiDocument } from '@trpc12/trpc/openapi';
// ---cut-end---
// server
import doc from './openapi.json' with { type: 'json' };
experimental_openApiReference({ document: doc as OpenApiDocument });
```

Where a procedure has a runtime schema, that schema wins, so the two generators agree. Types become JSON Schema the way `JSON.stringify` sends them:

- `Date` is a `date-time` string, and `toJSON()` is followed.
- Functions, symbols, `bigint` and `undefined` are left out; optional properties aren't `required`.
- Branded primitives (`string & { __brand }`) are their primitive.
- Recursive types become `components.schemas`.
- JSDoc comments become `description`s.

`typescript` (7.x) is an optional peer dependency, needed only where this runs. `tsconfig` picks the project; it defaults to the nearest one that includes `file`.

An output declared with `.output(schema, { validate: false })` isn't validated. The document then describes the schema's input side, which is what the resolver returns.

## Credits

The generator follows [oRPC's OpenAPI specification](https://orpc.dev/docs/openapi/specification), and `experimental_openApiReference()` its [OpenAPI reference plugin](https://orpc.dev/docs/plugins/openapi-reference).
