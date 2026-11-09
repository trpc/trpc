---
title: Should `dispose()` wait for HTTP requests on a different timeout than for sockets?
summary: "`createFetchHandler`'s `dispose()` waits for requests and sockets on one `websocket.drainTimeout` (10 s); HTTP could get its own, or the option move up."
area: server
recommended: C
links:
  - kind: decision
    label: handler-core-on-effect
    url: ../decisions/handler-core-on-effect.md
  - kind: docs
    label: Adapters (dispose and drain)
    url: https://v12.trpc.io/v12/docs/adapters/overview
  - kind: code
    label: BaseHandlerOptions.websocket.drainTimeout
    url: ../../packages/trpc/src/server/handler/fetch.ts
  - kind: code
    label: createHandlerCore's close
    url: ../../packages/trpc/src/server/handler/core.ts
---

# Should `dispose()` wait for HTTP requests on a different timeout than for sockets?

## Why it matters

Since the second pass, `dispose()` waits for the requests `fetch` is serving, streamed bodies included, then answers what's left with a 503. It waits concurrently with the socket drain, on one budget: `websocket.drainTimeout` on `createFetchHandler`, a top-level `drainTimeout` on the OpenAPI and v11 handlers, 10 seconds by default. So `dispose()` takes as long as the slowest request, and a test or script that leaves a response body unread waits the full 10 seconds. The HTTP wait is also configured under `websocket`, where nobody looks for it.

## Options

### A) Keep it as it is: one budget under `websocket`

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { createFetchHandler } from '@trpc12/trpc/server';
import { experimental_createOpenApiHandler } from '@trpc12/trpc/openapi';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
// ---cut-end---
const handler = createFetchHandler({
  router,
  websocket: { drainTimeout: '20 seconds' }, // sockets and HTTP requests
});

const openapi = experimental_createOpenApiHandler({
  router,
  drainTimeout: '20 seconds',
});
```

- ✅ One number bounds `dispose()`, which is what a platform's grace period limits
- ✅ Nothing changes
- ❌ The HTTP wait hides under `websocket`, and the name differs from the other handlers'

### B) A separate, shorter timeout for HTTP

A top-level `drainTimeout` covers the HTTP requests, 5 seconds by default; `websocket.drainTimeout` keeps covering the sockets, 10 seconds by default.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { createFetchHandlerB as createFetchHandler } from '../open/http-drain-timeout.ts';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
// ---cut-end---
const handler = createFetchHandler({
  router,
  drainTimeout: '5 seconds', // HTTP requests
  websocket: { drainTimeout: '30 seconds' }, // sockets moving to a new instance
});
```

- ✅ A stuck request doesn't hold `dispose()` as long as a socket move may need
- ✅ Tests with an unread body wait less by default
- ❌ Two settings to keep under the platform's grace period instead of one; since they run concurrently, `dispose()` still takes the longer of the two
- ❌ `drainTimeout` means requests only here, but requests and sockets on the OpenAPI and v11 handlers

### C) One budget, as a top-level `drainTimeout` on every handler

`websocket.drainTimeout` moves to a top-level `drainTimeout`, the name the OpenAPI and v11 handlers already use, still 10 seconds and still for both. `drain()` and `serve()` default to it.

```ts twoslash
// @errors: 2353
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { createFetchHandlerC as createFetchHandler } from '../open/http-drain-timeout.ts';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
// ---cut-end---
// before: doesn't compile any more, the option moved up
createFetchHandler({ router, websocket: { drainTimeout: '20 seconds' } });
// after
createFetchHandler({ router, drainTimeout: '20 seconds' });
```

- ✅ One number bounds `dispose()`, named the same on all three handlers
- ✅ The option sits where an HTTP-only user looks for it
- ❌ A rename of a stable option; nothing has shipped, so no alias is needed
- ❌ Tests with an unread body still wait the full timeout, unless they read or cancel it

## Recommendation

**C.** Platforms bound shutdown with one grace period, so one budget is the right model. What's wrong today is only where it lives, and C puts it where the other handlers already have it. A test that leaves a body unread should cancel its reader, as `middleware/durable.test.ts` now does.

## Blocked until answered

- Nothing is blocked. The adapters overview documents `websocket.drainTimeout`, and would change with B or C.
