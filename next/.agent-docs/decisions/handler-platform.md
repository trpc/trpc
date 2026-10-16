# Handlers take a typed platform argument (human)

- Human, 2026-10-15 (issues review Q6, #7436): "A".
  - `handler.fetch(request, platform)` and `handler.websocket(socket, { request, platform })`.
  - Typed by a handler generic: `createFetchHandler<AppRouter, { env: Env; ctx: ExecutionContext }>(…)`.
  - Read only in `createContext({ request, platform })`; there is no init-level variant.
  - Node, Bun and `serve()` pass `undefined`.
  - Passing it is required when its type isn't `undefined`.
- Why: Workers hand `env` and `ctx` to `fetch(request, env, ctx)`, not to module scope, and the earlier `WeakMap` recipe was boilerplate every Workers app needed.
- Lost: reading platform values in middleware without going through `ctx`.
- Lives in: `packages/trpcdev/src/server/fetch.ts`, `src/server/socket.ts`, `docs/platforms.md`.
