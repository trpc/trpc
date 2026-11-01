---
title: A contract from OpenAPI
description: Generate a typed contract module from any OpenAPI 3.0 or 3.1 document.
section: Contracts and OpenAPI
order: 5
experiment: contracts
---

`experimental_generateContractFromOpenApi(document, { prefix?, exportName?, patterns? })` turns an OpenAPI 3.0 or 3.1 document into the source of a `@trpc12/trpc/contract` module. Schemas are Effect Schemas, translated by Effect's `SchemaRepresentation`; each operation becomes a procedure with its `route` meta (under `.concat(experimental_openapi())`), so the contract works with `experimental_openApiLink` and `experimental_validationLink` against any REST API:

```ts twoslash
// ---cut-start---
import { writeFile } from 'node:fs/promises';
// ---cut-end---
import { experimental_generateContractFromOpenApi } from '@trpc12/trpc/openapi';

const document = await (
  await fetch('https://petstore.example/openapi.json')
).json();
await writeFile(
  'src/petstore.ts',
  experimental_generateContractFromOpenApi(document, {
    exportName: 'petstore',
  }),
);
```

```ts twoslash
// ---cut-start---
import { Schema } from 'effect';
import { experimental_contract as trpcContract } from '@trpc12/trpc/contract';
import { experimental_openapi } from '@trpc12/trpc/openapi';
// ---cut-end---
// src/petstore.ts (generated)
export const Pet = Schema.Struct({
  id: Schema.Int,
  name: Schema.String,
});
// ---cut-start---
export const PetsListInput = Schema.Struct({
  limit: Schema.optionalKey(Schema.Int),
});
export const PetsListOutput = Schema.Array(Pet);
// ---cut-end---
const c = trpcContract.create().concat(experimental_openapi());
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
- Path and query parameters merge with the JSON body into one input, like `inputStructure: 'compact'`. Parameters declared on the path apply to each of its operations, and `$ref`s to `components.parameters`, `requestBodies` and `responses` are followed.
- An operation with header parameters takes `{ params, query, headers, body }` instead (`inputStructure: 'detailed'`), with header names in lowercase. `Accept`, `Content-Type` and `Authorization` parameters are ignored, as OpenAPI says, and so are cookie parameters, which a browser `fetch` can't set; send them with the link's `headers`.
- Objects that don't mention `additionalProperties` become closed structs (extra keys are still ignored when decoding), except where `allOf` merges them.
- Error responses in `@trpc12/trpc`'s own shape (`code` and `data`) become `.errors()`, so a document from `experimental_generateOpenApi` round-trips with typed errors. Other APIs' errors stay unexpected errors.
- `pattern`s are ignored unless `patterns: 'apply'`; only use that with documents you trust.

## Credits

Generating contracts from OpenAPI documents follows [oRPC](https://orpc.dev/docs/contract/generate-from-openapi), which does it with a Hey API plugin.
