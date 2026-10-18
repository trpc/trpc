# Examples

Every example is a full app you can run: a server, a client that calls it, and one command that runs both. Each depends on `@trpc12/trpc: workspace:*` and stays standalone (its own `tsconfig.json`, no `@tooling/*`). The set and why it exists: [`decisions/example-set.md`](../.agent-docs/decisions/example-set.md).

## Layout

Three entry files at the example's root, beside its `README.md`. Other modules go wherever suits the example (`src/`, `packages/`).

- **`server.ts`**: the router (or its import) and the handler. Exports `type AppRouter` and `listen(port = 0)`, which starts the server and resolves to `{ url, [Symbol.asyncDispose] }`: `url` is the tRPC endpoint (`http://127.0.0.1:<port>/trpc`), and disposing stops the server and releases the handler. Run directly (`if (import.meta.main)`), it listens on `PORT` (default 3000), prints the URL and serves until Ctrl-C.
- **`client.ts`**: exports `main(url)`, which makes the client, calls the server, logs what it gets and throws on a wrong result (`node:assert/strict`). Run directly, it calls `process.argv[2]` or `http://localhost:3000/trpc`.
- **`start.ts`**: `await using server = await listen(); await main(server.url);`. A free port, no waiting on ports, and the process exits on its own once both are done.

`package.json` scripts:

```json
{
  "start": "node start.ts",
  "server": "node server.ts",
  "client": "node client.ts",
  "smoke": "pnpm start",
  "typecheck": "tsc --noEmit -p tsconfig.json"
}
```

`pnpm start` runs the example. `pnpm server` and `pnpm client` in two terminals run the halves apart, so you can point other clients at the server. `pnpm example` (from `next/`) runs every example's `smoke`, which is `pnpm start`, with any build step it needs first (`tsc -b && pnpm start`).

A server that isn't a Node process keeps the same three files: `server.ts` is the runtime's entry (a Worker's `export default`), and `start.ts` starts it that runtime's way (Wrangler's `unstable_startWorker`) before calling `main(url)`.

Framework apps (Next.js, TanStack Start, …) don't use this layout. They keep their framework's own files and scripts (`next dev`, `next build`, `next start`), and their `smoke` builds and checks the app however suits it.

Tests of the example's own code are `*.test.ts` files under its root or `src/`; `pnpm test` from `next/` runs them.

## Compared to v11's

v11's examples (the repo root's `examples/`) had `src/server.ts` and `src/client.ts` too, run with `run-p`, `wait-port` and `start-server-and-test` on a fixed port. Here the client is a function the start script calls with the server's URL, so there are no extra tools, no port to wait for or collide on, and a failed assertion fails the run.
