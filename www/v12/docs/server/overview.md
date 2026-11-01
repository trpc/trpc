---
title: The server
label: Overview
description: How procedures, routers, context and the handler fit together, and where each page of this section comes in.
section: Server
order: 0
v11: server/overview
---

A server is a few plain values. `initTrpc()` makes the root `t` from the context type, `t.procedure` builds procedures, a router is an object of procedures, and `createFetchHandler` serves the router over HTTP, SSE and WebSockets. This is the blog app that most code blocks in these docs build on:

```sample title="server.ts"
docs/src/server.ts
```

## Building procedures

- [Procedures](./procedures.md): queries, mutations and subscriptions, with validated input and output.
- [Routers](./routers.md): objects of procedures, merged and split into lazy subtrees.
- [Context](./context.md): what every call gets as `ctx`, from the request or from middleware.
- [Middleware](./middleware.md): base procedures that add to the context, replace the input or stop a call. [Built-in middleware](../middleware/overview.md) covers lifecycle hooks.

## What a procedure returns

- [Errors](./errors.md): one error class, typed on the client from what resolvers return.
- [Streaming](./streaming.md): async generators, Effect streams and nested promises.
- [Files](./files.md): `File` and `Blob` values in inputs and outputs.
- [Responses](./responses.md): headers, status, or a `Response` of your own.
- [Transformers](./transformers.md): plain JSON by default, or types like `Date` and `Map` that survive the wire.

## Growing an app

- [Effect](./effect.md): resolvers that return Effects, with services from the handler's layer.
- [Extensions](./extensions.md): packages that add middleware, context, `meta` and errors to every procedure.
- [Server-side calls](./server-side-calls.md): call procedures in process, for tests and server code.

The handler runs on every runtime: [Adapters](../adapters/overview.md) has one page per runtime.
