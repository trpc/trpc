---
title: Migrating from v11
description: Serve v11 clients from the new router with createV11Handler, run the codemod, then move the clients.
section: Migrations
order: 1
---

Move the server first, so you can deploy before every client (a mobile app in the stores, a tab left open) updates. Then move the clients to `@trpc12/trpc/client` and drop the old endpoint:

1. **Serve v11 clients from the new router.** `createV11Handler` from `@trpc12/trpc/interop` speaks every v11 link on the endpoint they already call, next to the v12 handler ([Serving v11 clients](./from-v11/serve-v11-clients.md)).
2. **Run the codemod.** `npx @trpc12/upgrade src` rewrites what has one v12 form and lists the rest as `file:line:column` steps ([The codemod](./from-v11/codemod.md)).
3. **Move the clients.** Your own v11 links keep working in a v12 chain with `fromV11Link` until you rewrite them ([v11 links](./from-v11/links.md)).
4. **Drop the old endpoint** once no v11 client calls it.

[API changes](./from-v11/api-changes.md) maps each v11 API to its v12 form.

The [`examples/v11-migration`](../../examples/v11-migration/README.md) app follows these steps. Its v11 clients (batching, SSE and WebSocket subscriptions, superjson, TanStack Query) call the new server through `createV11Handler`. Its v12 client keeps a custom v11 link through `fromV11Link`. Its smoke runs the codemod on a copy of the v11 app and checks every step it prints.
