---
title: The document
description: Generate an OpenAPI 3.1 document from the router's schemas, or from its types.
section: OpenAPI
order: 2
v11: openapi
---

```ts
import { generateOpenApi } from '@trpc12/trpc/openapi';
import { loadRouter } from '@trpc12/trpc/server';

const doc = generateOpenApi(await loadRouter(appRouter), {
  info: { title: 'API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
});
```

The document has schemas for input, output and each declared error. `filter({ path, procedure })` drops operations. `target: 'rpc'` describes the RPC endpoint instead of the REST routes. `generateOpenApi` throws on a lazy subtree that hasn't loaded, so pass the result of `loadRouter()`.

## From the types

`generateOpenApi` only sees runtime schemas. `experimental_generateOpenApiFromTypes` from `@trpc12/trpc/openapi/typescript` also reads the router's types with the TypeScript 7 compiler, so it documents:

- errors that are only inferred (returned with `error()`, failed or yielded in an Effect), never declared, with their status: a `TrpcError.Tagged` class's literal `status`, the built-in code's status, or `400`;
- the input and output of procedures without static schemas (no `.output()`, or a ctx-callback input).

```ts
// scripts/openapi.ts, run at build time
import { experimental_generateOpenApiFromTypes } from '@trpc12/trpc/openapi/typescript';
import { appRouter } from '../src/router.ts';

const doc = await experimental_generateOpenApiFromTypes(appRouter, {
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
