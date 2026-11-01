---
title: Should every procedure be reachable over REST by default, or only the ones with a `route`?
summary: Today `experimental_createOpenApiHandler` serves every procedure, `GET /api/post/byId` without a `route`; REST could require `route`, or gain a filter.
area: openapi
recommended: A
questions: [Q18.2]
links:
  - kind: proposal
    label: Proposal 18, (b) Routing and mapping
    url: ../proposals/18-openapi.md
  - kind: decision
    label: openapi
    url: ../decisions/openapi.md
  - kind: decision
    label: openapi-csrf-guard
    url: ../decisions/openapi-csrf-guard.md
  - kind: docs
    label: REST routes
    url: https://v12.trpc.io/v12/docs/openapi/routes
  - kind: code
    label: The `route` meta
    url: ../../packages/trpc/src/openapi/rest/routes.ts
  - kind: code
    label: experimental_createOpenApiHandler
    url: ../../packages/trpc/src/openapi/handler.ts
---

# Should every procedure be reachable over REST by default, or only the ones with a `route`?

## Why it matters

Today a procedure without `route` meta is still a REST route: a query is `GET {prefix}/post/byId`, a mutation `POST`, and a subscription `GET` with `text/event-stream`. That was the agent's call after the question was skipped on 2026-10-16, following oRPC. So every internal procedure is on the REST surface too, with the same auth as over RPC. `experimental_generateOpenApi` has a `filter`, but the handler has none, so a filtered procedure is left out of the document but still served. Defaults also mean every mutation accepts urlencoded and multipart bodies, which the CSRF guard (the human said "on by default") now protects.

## Options

### A) Keep the defaults

The whole router works over REST with no configuration; `route` only changes a procedure's method, path or status.

```ts twoslash
// ---cut-start---
import {
  experimental_createOpenApiHandler,
  experimental_openapi,
} from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import type { Context, Post } from './server.ts';
declare function getPost(opts: { input: { id: string } }): Post | undefined;
declare function createContext(): Context;
// ---cut-end---
const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());

const appRouter = t.router({
  post: {
    byId: t.procedure.input(z.object({ id: z.string() })).query(getPost),
    // served at GET /api/post/byId?id=1
    get: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .query(getPost),
    // served at GET /api/posts/1
  },
});

export const api = experimental_createOpenApiHandler({
  router: appRouter,
  createContext,
});
```

- ✅ The whole router is usable over REST with no configuration, as in oRPC.
- ❌ Internal procedures are on the REST surface, and in the document unless `filter`ed.

### B) Require `route`

Only procedures with `route` meta are served and documented.

```ts twoslash
// ---cut-start---
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import type { Context, Post } from './server.ts';
const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());
const ById = z.object({ id: z.string() });
declare function getPost(opts: { input: { id: string } }): Post | undefined;
// ---cut-end---
const appRouter = t.router({
  post: {
    byId: t.procedure.input(ById).query(getPost), // 404 over REST, not in the document
    get: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(ById)
      .query(getPost), // GET /api/posts/1
  },
});
```

- ✅ An explicit public REST surface: nothing appears by accident. MCP's proposed opt-in works the same way.
- ❌ Every REST procedure needs a `route` line, unlike oRPC.

### C) Defaults, plus a `filter` on the handler

Keep A, and give the handler the generator's `filter`, so one predicate hides a procedure from both.

```ts twoslash
// ---cut-start---
import {
  experimental_generateOpenApi,
  experimental_openapi,
} from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { experimental_createOpenApiHandlerC as experimental_createOpenApiHandler } from '../open/openapi-default-rest-routes.ts';
import type { Context } from './server.ts';
const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());
const appRouter = t.router({
  post: { byId: t.procedure.query(() => null) },
  internal: { reindex: t.procedure.mutation(() => 'ok') },
});
const info = { title: 'Blog', version: '1.0.0' };
declare function createContext(): Context;
// ---cut-end---
const filter = ({ path }: { path: string }) => !path.startsWith('internal.');

export const api = experimental_createOpenApiHandler({
  router: appRouter,
  createContext,
  filter,
});
const doc = experimental_generateOpenApi(appRouter, { info, filter });
// internal.reindex: 404 over REST, not in the document
```

- ✅ Zero configuration stays, with one way to hide internals from both.
- ❌ One more option, passed twice unless `experimental_openApiReference` reads it from the handler.

## Recommendation

**A.** It's built, matches oRPC, and costs nothing until someone needs to hide a procedure. The same middleware and auth run as over RPC, and the CSRF guard covers the form bodies. If served-but-undocumented procedures bother the human, C adds to A without breaking it.

## Blocked until answered

- Nothing. A is what's built and documented in `www/docs/openapi/routes.md`.
