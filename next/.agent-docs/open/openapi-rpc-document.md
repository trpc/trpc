---
title: Should OpenAPI keep both a REST handler and a generator that can also describe the plain RPC endpoint?
summary: "Today `@trpc12/trpc/openapi` serves REST and documents either REST or the RPC endpoint (`target: 'rpc'`); one of the two could go."
area: openapi
recommended: A
questions: [Q18.1]
links:
  - kind: proposal
    label: Proposal 18, OpenAPI
    url: ../proposals/18-openapi.md
  - kind: decision
    label: openapi
    url: ../decisions/openapi.md
  - kind: decision
    label: openapi-type-generator-v1
    url: ../decisions/openapi-type-generator-v1.md
  - kind: docs
    label: OpenAPI overview
    url: https://v12.trpc.io/v12/docs/openapi/overview
  - kind: docs
    label: The document
    url: https://v12.trpc.io/v12/docs/openapi/document
  - kind: code
    label: experimental_generateOpenApi
    url: ../../packages/trpc/src/openapi/generate.ts
  - kind: code
    label: experimental_createOpenApiHandler
    url: ../../packages/trpc/src/openapi/handler.ts
---

# Should OpenAPI keep both a REST handler and a generator that can also describe the plain RPC endpoint?

## Why it matters

`@trpc12/trpc/openapi` does both today ("O-C", the agent's call after the question was skipped on 2026-10-16). `experimental_createOpenApiHandler` serves the router over REST, and `experimental_generateOpenApi` documents either that REST mapping (`target: 'openapi'`) or the RPC endpoint (`target: 'rpc'`). The human's answer to Q18.3 is recorded as "The OpenAPI scope is ratified" ([`openapi-type-generator-v1.md`](../decisions/openapi-type-generator-v1.md)), but the quoted answer was only "B" to the TypeScript generator, so this may already be settled; A confirms it. OpenAPI is three rows of the oRPC parity table. Everything here is `experimental_` and hidden in the "Contracts and OpenAPI" docs experiment.

## Options

### A) Keep both

A REST handler, plus a generator for either the REST routes or the RPC endpoint.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import type { Context, Post } from './server.ts';
declare function getPost(opts: { input: { id: string } }): Post | undefined;
declare function createContext(): Context;
const info = { title: 'Blog', version: '1.0.0' };
// ---cut-end---
import {
  experimental_createOpenApiHandler,
  experimental_generateOpenApi,
  experimental_openapi,
} from '@trpc12/trpc/openapi';

const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());
// ---cut-start---
const appRouter = {
  post: {
    byId: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .query(getPost),
  },
};
// ---cut-end---

export const api = experimental_createOpenApiHandler({
  router: appRouter,
  prefix: '/api',
  createContext,
});

const restDoc = experimental_generateOpenApi(appRouter, {
  info,
  target: 'openapi',
});
// GET /api/posts/{id}
const rpcDoc = experimental_generateOpenApi(appRouter, { info, target: 'rpc' });
// GET /trpc/post.byId, responses wrapped in { json }
```

- ✅ Built and tested, and matches oRPC's handler plus generator.
- ✅ An app that only serves RPC gets a document with no setup.
- ❌ Two document shapes to keep correct. The RPC one is wrong today for query inputs (see Details), so A includes that fix.

### B) The REST handler and its document only

Drop `target: 'rpc'`. The document always describes the REST routes.

```ts twoslash
// ---cut-start---
import { experimental_createOpenApiHandler } from '@trpc12/trpc/openapi';
import { experimental_generateOpenApiB as experimental_generateOpenApi } from '../open/openapi-rpc-document.ts';
import { appRouter, type Context } from './server.ts';
declare function createContext(): Context;
const info = { title: 'Blog', version: '1.0.0' };
// ---cut-end---
export const api = experimental_createOpenApiHandler({
  router: appRouter,
  createContext,
});
const doc = experimental_generateOpenApi(appRouter, { info }); // REST routes only
```

- ✅ One document shape to keep correct.
- ❌ An app that only serves RPC adds the REST handler before it gets a document.

### C) The RPC endpoint only

No REST handler: the document describes the RPC endpoint as it is, like v11's OpenAPI support.

```ts twoslash
// ---cut-start---
import { experimental_generateOpenApiC as experimental_generateOpenApi } from '../open/openapi-rpc-document.ts';
import { appRouter } from './server.ts';
const info = { title: 'Blog', version: '1.0.0' };
// ---cut-end---
const doc = experimental_generateOpenApi(appRouter, { info }); // GET /trpc/post.byId?input=…
// no experimental_createOpenApiHandler, no `route` meta
```

- ✅ Nothing new on the server to maintain.
- ❌ No custom paths or path params, and JSON in a query string isn't idiomatic REST.
- ❌ Loses the parity rows and `experimental_openApiLink`, which the human put in v1 (Q18.4, "V1").

## Recommendation

**A.** It's built, it matches oRPC, and RPC-only apps get a document with zero configuration. The bug in Details is a reason to test the RPC target against the RPC handler, not to drop it.

## Blocked until answered

- Nothing. A is what's built. B would remove `target` from `GenerateOpenApiOptions`, and C would remove the handler, `route` meta and `experimental_openApiLink`.

## Details

- Found while writing this, on 2026-10-20: `target: 'rpc'` documents a query's input as one query parameter per property (`GET /trpc/post.byId?id=1`, as the test `target: 'rpc' documents the RPC endpoint` expects). The RPC endpoint reads a single `?input=` parameter with the JSON input ([`wire-protocol.md`](../decisions/wire-protocol.md)). Against `createFetchHandler`, `?id=1` answers `400 Input validation failed`, and `?input={"id":"1"}` answers `200`. A generated client following today's RPC document can't call queries.
