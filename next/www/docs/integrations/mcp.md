---
title: MCP
description: Publish procedures as Model Context Protocol tools with `experimental_createMcpHandler`, so agents call them with your schemas, middleware and errors.
section: Integrations
order: 6
experiment: mcp
---

[MCP](https://modelcontextprotocol.io) (the Model Context Protocol) is how agents such as Claude, Cursor and ChatGPT call tools on a server. `@trpc12/trpc/mcp` publishes a router's procedures as MCP tools: their JSON Schemas come from the procedures' schemas, and a tool call runs the procedure with its middleware, validation and declared errors. It speaks MCP's Streamable HTTP transport itself, so it needs no MCP SDK.

```package-install
@trpc12/trpc effect zod
```

## Publishing procedures

The `experimental_mcp()` root extension adds an `mcp` meta key. A procedure with `mcp: true` or an object is a tool; the others aren't.

```ts twoslash
// ---cut-start---
import { db, type Context } from './server.ts';
// ---cut-end---
import { experimental_mcp } from '@trpc12/trpc/mcp';
import { error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const t = initTrpc<{ ctx: Context }>().concat(experimental_mcp());

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED', message: 'Sign in first' }),
);

export const appRouter = t.router({
  post: {
    byId: t.procedure
      .meta({ mcp: { description: 'Read one blog post by its id.' } })
      .input(z.object({ id: z.string().describe('The post id, e.g. "1"') }))
      .errors({ NOT_FOUND: { data: z.object({ id: z.string() }) } })
      .query(
        (opts) =>
          db.post.find(opts.input.id) ??
          opts.errors.NOT_FOUND({ data: { id: opts.input.id } }),
      ),
    create: authed
      .meta({ mcp: { description: 'Publish a post as the signed-in user.' } })
      .input(z.object({ title: z.string().min(3) }))
      .mutation((opts) =>
        db.post.create({ ...opts.input, author: opts.ctx.user.name }),
      ),
    // Not a tool: no `mcp` meta.
    list: t.procedure.query(() => db.post.list()),
  },
});
```

A model picks a tool by its description and fills in the arguments from the input's JSON Schema, so describe the procedure and its fields (`.describe()` in Zod).

## The handler

`experimental_createMcpHandler` serves the tools. Like the RPC handler, it has `fetch(request)` and `dispose()`, takes `createContext`, `layer` or `runtime`, `middleware` and `onError`, and answers whatever path it's mounted at:

```ts twoslash
// ---cut-start---
import { createServer } from 'node:http';
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node';
import { experimental_mcp } from '@trpc12/trpc/mcp';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { Layer } from 'effect';
const t = initTrpc<{ ctx: { token: string | undefined } }>().concat(
  experimental_mcp(),
);
const appRouter = t.router({
  health: t.procedure.meta({ mcp: true }).query(() => 'ok'),
});
const handler = createFetchHandler({
  router: appRouter,
  createContext: () => ({ token: undefined }),
});
// ---cut-end---
import { toHttpEffect } from '@trpc12/trpc/http';
import { experimental_createMcpHandler } from '@trpc12/trpc/mcp';
import { HttpRouter } from 'effect/http';

const mcp = experimental_createMcpHandler({
  router: appRouter,
  serverInfo: { name: 'blog', version: '1.0.0' },
  instructions: 'A blog. Read posts before changing them.',
  createContext: (opts) => ({ token: opts.request.headers['authorization'] }),
});

const app = Layer.mergeAll(
  handler.routes,
  HttpRouter.add('*', '/mcp', toHttpEffect(mcp)),
);

HttpRouter.serve(app).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain,
);
```

On a server that takes fetch handlers (Bun, Deno, Workers, Hono), route `/mcp` to `mcp.fetch`. Then point a client at the URL:

- Claude Code: `claude mcp add --transport http blog http://localhost:3000/mcp`.
- Cursor: `{ "mcpServers": { "blog": { "url": "http://localhost:3000/mcp" } } }` in `.cursor/mcp.json`.
- The [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector): `npx @modelcontextprotocol/inspector`, then connect to the URL with the Streamable HTTP transport.

The transport is MCP's stateless Streamable HTTP: every message is a `POST` with a JSON body, answered with JSON, and there are no sessions. It speaks protocol versions `2025-11-25`, `2025-06-18` and `2025-03-26`.

- A `GET` answers `405`, because there is no stream for the server to push on. Notifications answer `202`.
- A request whose `Origin` is neither the request's own nor in `allowedOrigins` is refused with `403`, as MCP requires against DNS rebinding.
- Bodies over `maxBodySize` (1 MiB) answer `413`.

## Which procedures become tools

- `include: 'meta'` (the default) publishes the procedures with `mcp` meta. `include: 'all'` publishes every query and mutation, and a predicate `({ path, type, meta }) => boolean` picks them.
- `mcp: false` hides a procedure, even with `include: 'all'`.
- Subscriptions and procedures with streamed outputs aren't tools: a tool call has one result.
- Lazy subtrees load on the first request.
- `filter({ tool, ctx })` hides tools per caller, from both `tools/list` and `tools/call`, with the context `createContext` made for the request.

## Tool definitions

| Tool field     | From                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`         | `mcp.name`, else the path joined with `separator` (`_`): `post_byId`. Two tools with one name throw when the handler is created.                                   |
| `title`        | `mcp.title`, else the [REST route](../openapi/routes.md)'s `summary`                                                                                               |
| `description`  | `mcp.description`, else the route's `description`, else its `summary`                                                                                              |
| `inputSchema`  | The input's JSON Schema. An input that isn't an object, like `z.string()`, is the `input` argument.                                                                |
| `outputSchema` | The output's JSON Schema, when there's an `.output()`. An output that isn't an object is under `result`.                                                           |
| `annotations`  | `mcp.annotations`, over `readOnlyHint` and `idempotentHint` for queries, and `idempotentHint` for mutations routed as `PUT` or `DELETE`. They're hints, not rules. |
| `icons`        | `mcp.icons`                                                                                                                                                        |
| `_meta`        | `io.trpc/path`, `io.trpc/type` and `io.trpc/errors` (the codes `.errors()` declares)                                                                               |

Later `.meta({ mcp })` calls merge into earlier ones key by key, and `annotations` hint by hint, so a base procedure can mark every tool under it `openWorldHint: true`.

`experimental_describeTools(router, { include, separator })` returns the tools without serving them, e.g. to check them in a test.

## Results

- The output is sent as JSON text, and as `structuredContent` when it's an object (or under `result`, when the tool has an `outputSchema`). A string output is the text itself; `undefined` is no content.
- Arguments and outputs are JSON, so a `Date` output arrives as an ISO string, and a `z.date()` input can't be filled in: use `z.coerce.date()` for dates a model sends.
- A procedure's error is a result with `isError: true`, so the model reads it and can retry. Its text is the error as the OpenAPI handler sends it, `{ defined, code, message, data }`, with the validation `issues` for invalid arguments:

```json
{
  "defined": true,
  "code": "NOT_FOUND",
  "message": "NOT_FOUND",
  "data": { "id": "9" }
}
```

- Unexpected errors are masked as `Internal server error` unless `exposeUnexpectedErrors` is on, which it is only in development and test. `onError` sees every error with its cause.
- An unknown tool or a malformed message is a JSON-RPC error, not a result.

## Auth

MCP clients sign in with OAuth. When `createContext` throws `UNAUTHORIZED`, the handler answers `401` with `WWW-Authenticate: Bearer`, and with `resource_metadata="…"` when you pass `resourceMetadataUrl`: your [protected resource metadata](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), which tells the client where to sign in. Serve that document and verify the token in `createContext`; the handler doesn't issue tokens.

```ts twoslash
// ---cut-start---
import {
  experimental_createMcpHandler,
  experimental_mcp,
} from '@trpc12/trpc/mcp';
import { initTrpc } from '@trpc12/trpc/server';
interface User {
  name: string;
  admin: boolean;
}
declare function verifyToken(header: string | undefined): Promise<User | null>;
const t = initTrpc<{ ctx: { user: User } }>().concat(experimental_mcp());
const appRouter = t.router({
  health: t.procedure.meta({ mcp: true }).query(() => 'ok'),
});
// ---cut-end---
import { TrpcError } from '@trpc12/trpc/server';

const mcp = experimental_createMcpHandler({
  router: appRouter,
  resourceMetadataUrl:
    'https://api.example.com/.well-known/oauth-protected-resource/mcp',
  createContext: async (opts) => {
    const user = await verifyToken(opts.request.headers['authorization']);
    if (!user) throw new TrpcError({ code: 'UNAUTHORIZED' });
    return { user };
  },
  filter: (opts) => !opts.tool.name.startsWith('admin_') || opts.ctx.user.admin,
});
```

## Not yet

MCP's resources and prompts, progress, sessions, Server-Sent Events responses, and `Blob` outputs as image or file content aren't supported. Everything in `@trpc12/trpc/mcp` is `experimental_*` and might change in any release.

## Credits

Taking the title from the route's `summary`, `idempotentHint` for `PUT` and `DELETE` routes, icons, and errors with `defined` follow [oRPC's MCP integration](https://orpc.dev/docs/integrations/mcp).
