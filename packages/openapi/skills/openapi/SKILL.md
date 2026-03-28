---
name: openapi
description: >
  Generate OpenAPI 3.1 spec from a tRPC router with @trpc/openapi CLI or
  programmatic API. Generate typed REST client with @hey-api/openapi-ts and
  configureTRPCHeyApiClient(). Configure transformers (superjson, EJSON) for
  generated clients. Alpha status.
type: composition
library: trpc
library_version: '11.16.0-alpha'
requires:
  - server-setup
sources:
  - 'trpc/trpc:www/docs/client/openapi.md'
  - 'trpc/trpc:packages/openapi/test/heyapi.test.ts'
  - 'trpc/trpc:examples/openapi-codegen/'
---

# tRPC -- OpenAPI

> **Alpha**: `@trpc/openapi` is versioned as `11.x.x-alpha`. APIs may change without notice.

## Setup

### 1. Install

```bash
pnpm add @trpc/openapi
```

For HeyAPI client generation:

```bash
pnpm add @hey-api/openapi-ts -D
```

### 2. Generate the OpenAPI spec

The generator statically analyses your router's TypeScript types. It never executes your code.

**CLI:**

```bash
pnpm exec trpc-openapi ./src/server/index.ts -e appRouter -o openapi.json --title "My API" --version 1.0.0
```

| Option                | Default        | Description                 |
| --------------------- | -------------- | --------------------------- |
| `-e, --export <name>` | `AppRouter`    | Name of the exported router |
| `-o, --output <file>` | `openapi.json` | Output file path            |
| `--title <text>`      | `tRPC API`     | OpenAPI `info.title`        |
| `--version <ver>`     | `0.0.0`        | OpenAPI `info.version`      |

**Programmatic:**

```ts
import { generateOpenAPIDocument } from '@trpc/openapi';

const doc = await generateOpenAPIDocument('./src/server/index.ts', {
  exportName: 'appRouter',
  title: 'My API',
  version: '1.0.0',
});
```

### 3. Generate a HeyAPI client from the spec

```ts
// scripts/codegen.ts
import { rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';
import { generateOpenAPIDocument } from '@trpc/openapi';
import { createTRPCHeyApiTypeResolvers } from '@trpc/openapi/heyapi';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const routerPath = path.resolve(__dirname, '..', 'server', 'index.ts');
const outputDir = path.resolve(__dirname, '..', 'client', 'generated');
const specPath = path.resolve(__dirname, '..', '..', 'openapi.json');

async function main() {
  const doc = await generateOpenAPIDocument(routerPath, {
    exportName: 'appRouter',
    title: 'Example API',
    version: '1.0.0',
  });

  writeFileSync(specPath, JSON.stringify(doc, null, 2) + '\n');

  rmSync(outputDir, { recursive: true, force: true });

  await createClient({
    input: specPath,
    output: outputDir,
    plugins: [
      {
        name: '@hey-api/typescript',
        '~resolvers': createTRPCHeyApiTypeResolvers(),
      },
      {
        name: '@hey-api/sdk',
        operations: { strategy: 'single' },
      },
    ],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Run it:

```bash
pnpm tsx scripts/codegen.ts
```

### 4. Configure and use the generated client at runtime

```ts
import { configureTRPCHeyApiClient } from '@trpc/openapi/heyapi';
import { client } from './generated/client.gen';
import { Sdk } from './generated/sdk.gen';

configureTRPCHeyApiClient(client, {
  baseUrl: 'http://localhost:3000',
});
const sdk = new Sdk({ client });

// Queries -> GET, Mutations -> POST
const result = await sdk.greeting({ query: { input: { name: 'World' } } });
const user = await sdk.user.create({ body: { name: 'Bob', age: 30 } });
```

## Core Patterns

### CLI quick spec generation

```bash
# Default export name "AppRouter", output "openapi.json"
pnpm exec trpc-openapi ./src/server/router.ts

# Custom export name and output
pnpm exec trpc-openapi ./src/server/router.ts -e appRouter -o api.json --title "My API" --version 1.0.0
```

### HeyAPI codegen with type resolvers (transformer setup)

When the server uses a transformer, pass `createTRPCHeyApiTypeResolvers()` to the `@hey-api/typescript` plugin so generated types use `Date` instead of `string` for date-time fields and `bigint` for bigint fields:

```ts
import { createClient } from '@hey-api/openapi-ts';
import { createTRPCHeyApiTypeResolvers } from '@trpc/openapi/heyapi';

await createClient({
  input: './openapi.json',
  output: './generated',
  plugins: [
    {
      name: '@hey-api/typescript',
      '~resolvers': createTRPCHeyApiTypeResolvers(),
    },
    {
      name: '@hey-api/sdk',
      operations: { strategy: 'single' },
    },
  ],
});
```

### Runtime client with superjson transformer

When the tRPC server uses `superjson`, the client must be configured with the same transformer:

```ts
// src/shared/transformer.ts
import superjson from 'superjson';

export const transformer = superjson;
```

```ts
// src/server/trpc.ts
import { initTRPC } from '@trpc/server';
import { transformer } from '../shared/transformer';

const t = initTRPC.create({ transformer });
export const router = t.router;
export const publicProcedure = t.procedure;
```

```ts
// src/client/index.ts
import { configureTRPCHeyApiClient } from '@trpc/openapi/heyapi';
import superjson from 'superjson';
import { client } from './generated/client.gen';
import { Sdk } from './generated/sdk.gen';

configureTRPCHeyApiClient(client, {
  baseUrl: 'http://localhost:3000',
  transformer: superjson,
});
const sdk = new Sdk({ client });

const event = await sdk.getEvent({
  query: { input: { id: 'evt_1', at: new Date('2025-06-15T10:00:00Z') } },
});
// event.data.result.data.at is a Date object
```

### MongoDB EJSON transformer (cross-language)

For non-TypeScript clients, EJSON provides a language-agnostic serialization format:

```ts
import type { TRPCDataTransformer } from '@trpc/server';
import type { Document } from 'bson';
import { EJSON } from 'bson';

export const ejsonTransformer: TRPCDataTransformer = {
  serialize: (value) => EJSON.serialize(value),
  deserialize: (value) => EJSON.deserialize(value as Document),
};
```

```ts
import { configureTRPCHeyApiClient } from '@trpc/openapi/heyapi';
import { client } from './generated/client.gen';
import { ejsonTransformer } from './transformer';

configureTRPCHeyApiClient(client, {
  baseUrl: 'http://localhost:3000',
  transformer: ejsonTransformer,
});
```

### Response shape

All tRPC HTTP responses follow the envelope format. Access data through `result.data`:

```ts
const listResult = await sdk.user.list();
const users = listResult.data?.result.data; // the actual return value

const createResult = await sdk.user.create({ body: { name: 'nick' } });
const user = createResult.data?.result.data;
// user.createdAt instanceof Date === true (when transformer is configured)
```

### Descriptions in the spec

Zod `.describe()` calls and JSDoc comments on types, routers, and procedures become `description` fields in the generated OpenAPI spec. No annotations or decorators required.

## Common Mistakes

### Missing transformer config in HeyAPI client

When the tRPC server uses `superjson` or another transformer, the generated HeyAPI client must also be configured with the same transformer via `configureTRPCHeyApiClient(client, { transformer })`. Without this, `Date`, `Map`, `Set`, and other non-JSON types will be silently wrong at runtime -- they arrive as raw serialized objects instead of their native types.

Wrong:

```ts
configureTRPCHeyApiClient(client, {
  baseUrl: 'http://localhost:3000',
  // missing transformer -- Dates will be broken
});
```

Right:

```ts
configureTRPCHeyApiClient(client, {
  baseUrl: 'http://localhost:3000',
  transformer: superjson, // must match server's transformer
});
```

### Expecting subscriptions in OpenAPI spec

Subscriptions are currently excluded from OpenAPI spec generation. The generator silently skips any procedure with `type: 'subscription'`. SSE subscription support is planned but not yet available.

### Forgetting createTRPCHeyApiTypeResolvers when using a transformer

Without the type resolvers plugin, HeyAPI generates `string` types for date-time fields instead of `Date`. The `createTRPCHeyApiTypeResolvers()` function maps `date`/`date-time` format to `Date` and `bigint` format to `bigint` in the generated TypeScript SDK.

### Using the wrong export name

The CLI defaults to `--export AppRouter` (the type). If your file exports the router value as `appRouter`, pass `-e appRouter`. If the export is not found, the error message lists all available exports from the file.

## See Also

- **server-setup** -- Required. Define routers and procedures before generating the spec.
- **superjson** -- Transformer configuration for server and client. OpenAPI clients need matching transformer config.
- **validators** -- Zod `.describe()` calls propagate into OpenAPI `description` fields.
- Full working example: `examples/openapi-codegen/`
