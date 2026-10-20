---
title: 'Which procedures should become MCP tools: only those marked with `mcp` meta, all of them, or a list in the handler?'
summary: Agents could see only procedures marked `mcp`, every query and mutation unless hidden, or the tools listed in the handler.
area: mcp
recommended: A
questions: [Q25.2]
links:
  - kind: spike
    label: spikes/mcp
    url: ../../spikes/mcp/
  - kind: proposal
    label: Proposal 25, MCP
    url: ../proposals/25-mcp.md
  - kind: decision
    label: mcp-tools
    url: ../decisions/mcp-tools.md
  - kind: code
    label: The spike's router
    url: ../../spikes/mcp/app.ts
  - kind: decision
    label: root-extensions
    url: ../decisions/root-extensions.md
  - kind: decision
    label: openapi (REST defaults)
    url: ../decisions/openapi.md
---

# Which procedures should become MCP tools: only those marked with `mcp` meta, all of them, or a list in the handler?

## Why it matters

An agent calls whatever tools it's shown, without a human reviewing each call. In the spike, the `mcp()` root extension adds an `mcp` meta key, the way `experimental_openapi()` adds `route`. Only procedures that set the key are published. The OpenAPI handler went the other way: the whole router is REST with no configuration (the agent's call on Q18.2). This only applies if MCP is built in or shipped as a package, not as a recipe.

## Options

### A) Opt in with `mcp` meta, plus `include` on the handler

`mcp: true` or an object publishes a procedure. `include: 'all'` or a predicate widens that for routers built for agents. `mcp: false` always hides a procedure, and subscriptions are never tools.

```ts twoslash
// @errors: 2322
// ---cut-start---
import { error, initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import {
  experimental_createMcpHandlerA as experimental_createMcpHandler,
  experimental_mcpA as experimental_mcp,
} from '../open/mcp-which-procedures.ts';
import type { Post, User } from './server.ts';
interface Ctx {
  user: User | null;
}
const ById = z.object({ id: z.string() });
declare function getPost(opts: { input: { id: string } }): Post | undefined;
declare function deletePost(opts: { input: { id: string } }): void;
declare function reindex(): string;
declare function readSecret(): string;
// ---cut-end---
const t = initTrpc<{ ctx: Ctx }>().concat(experimental_mcp());
// ---cut-start---
const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);
// ---cut-end---

const appRouter = {
  post: {
    byId: t.procedure.meta({ mcp: true }).input(ById).query(getPost),
    delete: authed
      .meta({
        mcp: { title: 'Delete a post', annotations: { destructiveHint: true } },
      })
      .input(ById)
      .mutation(deletePost),
  },
  internal: {
    reindex: t.procedure.mutation(reindex), // not a tool
    secret: t.procedure.meta({ mcp: false }).query(readSecret), // never a tool
  },
};

experimental_createMcpHandler({ router: appRouter });
// tools/list → post_byId, post_delete
experimental_createMcpHandler({ router: appRouter, include: 'all' });
// tools/list → post_byId, post_delete, internal_reindex

// Doesn't compile: without experimental_mcp(), `mcp` isn't a meta key
initTrpc<{ ctx: Ctx }>().procedure.meta({ mcp: true });
```

- ✅ Publishing an API to agents takes a line someone wrote, so adding a router doesn't leak internal procedures or undescribed mutations.
- ✅ The meta is typed through the existing root-extension machinery. `.meta({ mcp })` without the extension is a type error.
- ❌ A router built for agents marks every procedure, or sets `include: 'all'`.

### B) Everything by default, `mcp: false` to hide

Every query and mutation is a tool unless it opts out, like the OpenAPI handler's REST routes.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import {
  experimental_createMcpHandlerB as experimental_createMcpHandler,
  experimental_mcpB as experimental_mcp,
} from '../open/mcp-which-procedures.ts';
const t = initTrpc().concat(experimental_mcp());
const appRouter = {
  post: {
    byId: t.procedure.query(() => null),
    delete: t.procedure.mutation(() => {}),
  },
  internal: { reindex: t.procedure.mutation(() => 'ok') },
};
// ---cut-end---
experimental_createMcpHandler({ router: appRouter });
// tools/list → post_byId, post_delete, internal_reindex

t.procedure.meta({ mcp: false }); // opt out
```

- ✅ No configuration, and consistent with the OpenAPI handler.
- ❌ An agent can call any mutation it finds, including ones nobody described or reviewed.

### C) An explicit map in the handler

The handler takes the tools by name, with no meta.

```ts twoslash
// ---cut-start---
import { initTrpc } from '@trpc12/trpc/server';
import { experimental_createMcpHandlerC as experimental_createMcpHandler } from '../open/mcp-which-procedures.ts';
const t = initTrpc();
const appRouter = {
  post: {
    byId: t.procedure.query(() => null),
    delete: t.procedure.mutation(() => {}),
  },
};
// ---cut-end---
experimental_createMcpHandler({
  router: appRouter,
  tools: { post_byId: appRouter.post.byId, post_delete: appRouter.post.delete },
});
```

- ✅ Explicit and typed, with the whole tool list in one place.
- ❌ Names and descriptions live away from the procedure, and there's no `mcp` meta to carry annotations.

## Recommendation

**A.** Exposing a mutation to something that acts on its own should be deliberate. `include: 'all'` keeps a router built for agents to one line. A reuses root extensions, the existing typed-meta mechanism, rather than adding a second way to list tools.

## Blocked until answered

- The `mcp` meta's shape and the handler's `include` option, if MCP is built.

## Details

- `mcp` meta merges key by key across `.meta()` calls, and `annotations` merges too, so a base procedure can set `readOnlyHint` and a leaf can add `destructiveHint`.
- `title` and `description` fall back to `route.summary` and `route.description`, so a router documented for OpenAPI is documented for agents with no restating.
