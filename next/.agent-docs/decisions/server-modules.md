# `server/` is grouped into folder modules, each imported through its `index.ts` (human asked)

- Human, 2026-10-18: "queue some refactor to group things based on functionality liiiike everythign that deals with a request handling should be in a folder so it's more natural to follow it - a bunch of stuff is just flat into next/packages/trpc/src/server whereas i'm sure a bunch of it only really has one entrypoint for the rest of the app. do good modules / if possible you can enforce module boundaries with some lint rule or something".
- (agent) Each folder under `packages/trpc/src/server/` is a module:
  - `validation/`: `schema.ts` and `stream-schema.ts`, input and output schemas.
  - `subscriptions/`: `tracked.ts` and `publisher.ts`.
  - `procedures/`: `procedure.ts`, `router.ts`, `middleware.ts`, `builder.ts`, `implement.ts` and `init.ts`, defining an API.
  - `execution/`: `execute.ts`, `declared.ts`, `response.ts`, `frame-sink.ts` and `events.ts`, running a call.
  - `sockets/`: `socket.ts`, `socket-session.ts` and `upgrade.ts`.
  - `handler/`: `fetch.ts`, `core.ts`, `routes.ts`, `body.ts` and `handler-context.ts`, request handling.
- (agent) The built-in middleware (`durable.ts`, `lock.ts`, `ratelimit.ts`) moved into `src/middleware/`, beside the `/middleware` entry that exports it.
- (agent) A module's `index.ts` re-exports, by name, what the rest of the package uses. That is wider than the public entry points, whose `exports` don't change.
- (agent) A module imports only modules before it at runtime: `validation` and `subscriptions`, then `procedures`, then `execution`, `sockets` and `handler`. So the `index.ts` files add no import cycles (`import/no-cycle` fails on one). Only `import type` edges point back, such as `sockets/socket.ts` naming `HandlerCore` from `handler/`.
- (agent) Lint enforces it with `trpc/module-boundaries`, a rule in `tooling/oxlint-plugin/`. Code outside a module imports only its `index.ts`, and a module's files import each other directly, never their own `index.ts`. Loose files in `server/` (`index.ts`, `caller.ts`) aren't modules, and neither is `server/fixtures/` (test fixtures, set as `ignore`). A custom rule because oxlint has no `import/no-restricted-paths`, and `no-restricted-imports` matches the import string rather than the resolved file, so it would need an override per module.
- (agent) Tests move with their module ([`test-layout.md`](./test-layout.md)). Ones that cover the whole server (`basics`, `errors`, `tagged-errors`, `tracing`) stay in `server/`.
- Why: a folder holds one feature, and its `index.ts` lists what the rest of the package relies on, so a reader follows a feature without reading 27 neighbours.
- Lost: an extra hop through `index.ts` for each import across modules, and `index.ts` lists kept by hand. History needs `git log --follow` across the moves.
- Open: `openapi/`, `client/`, `interop/` and `serializer/` have the same flat layout. Their folders are public entry points, so their internals would need an internal `index.ts` or a second root in the rule.
- Lives in: `packages/trpc/src/server/*/index.ts`, `packages/trpc/src/middleware/`, `tooling/oxlint-plugin/module-boundaries.ts`, `vite.config.ts` (`trpc/module-boundaries`), `next/AGENTS.md` (Lint and style).
