---
title: The document
description: Generate an OpenAPI 3.1 document from the router's schemas, or from its types.
section: Contracts and OpenAPI
order: 3
v11: openapi
hidden: true
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

The document has schemas for input, output and each declared error. `filter({ path, procedure })` drops operations. `target: 'rpc'` describes the RPC endpoint instead of the REST routes. `experimental_generateOpenApi` throws on a lazy subtree that hasn't loaded, so pass the result of `loadRouter()`.

## From the types

`experimental_generateOpenApi` only sees runtime schemas. `experimental_generateOpenApiFromTypes` from `@trpc12/trpc/openapi/typescript` also reads the router's types with the TypeScript 7 compiler, so it documents:

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
