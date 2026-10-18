---
title: OpenAPI
label: Overview
description: Serve the router over REST, document it as OpenAPI 3.1, call REST routes from the client, and generate contracts from OpenAPI documents.
section: OpenAPI
order: 0
v11: openapi
---

`@trpc12/trpc/openapi` puts the same router behind REST routes and an OpenAPI 3.1 document, so tools and clients that don't speak tRPC can call it. RPC and REST run side by side; neither changes the other.

```ts twoslash
// ---cut-start---
import { db } from './server.ts';
// ---cut-end---
import {
  createOpenApiHandler,
  generateOpenApi,
  openapi,
} from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const t = initTrpc().concat(openapi());

const router = {
  post: {
    byId: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .query((opts) => db.post.find(opts.input.id) ?? null),
  },
};

const rest = createOpenApiHandler({ router });
const doc = generateOpenApi(router, {
  info: { title: 'Blog', version: '1.0.0' },
});
```

`GET /api/posts/1` now calls `post.byId`, and `doc` describes it with the input and output schemas.

- [REST routes](./routes.md): route meta, the handler, how inputs map to paths, queries and bodies, and outputs and errors.
- [The document](./document.md): generate the document from the router's schemas, or from its types.
- [Calling REST from the client](./client.md): `openApiLink` sends each call to its REST route, typed from a contract.
- [A contract from OpenAPI](./from-document.md): generate a typed contract module from any OpenAPI 3.0 or 3.1 document, to call APIs that aren't tRPC.
