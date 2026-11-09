# MCP example (experimental)

One router served over RPC (`/trpc`) and as Model Context Protocol tools (`/mcp`), so agents call its procedures with their schemas, middleware and errors. See [MCP](https://v12.trpc.io/v12/docs/integrations/mcp).

- `router.ts`: the router; `post.byId` and `post.create` are tools through their `mcp` meta, `post.list` isn't.
- `server.ts`: serves `createFetchHandler` and `experimental_createMcpHandler` on one port.
- `client.ts`: lists and calls the tools with the official MCP SDK client (a declared `NOT_FOUND` comes back as a tool error), then reads the posts over RPC.

Everything under `@trpc12/trpc/mcp` is `experimental_*` and might change or go away in any release.

`pnpm start` runs both. With `pnpm server` running, point an agent at `http://localhost:3000/mcp`: `claude mcp add --transport http blog http://localhost:3000/mcp`, or `npx @modelcontextprotocol/inspector`. The [examples README](../../README.md) has the layout.
