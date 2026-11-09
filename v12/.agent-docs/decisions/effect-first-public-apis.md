# Router and procedure declaration need no Effect knowledge; the rest of the public API may be Effect-first (human)

- Human, 2026-10-20: "Btw on the effect stuff, you were allowed to change public apis wrt Effect. It's fine if the server has some effect stuff, esp when doing plugins, just the like router and procedure declaration thay should work without effect knowledge".
- (agent) Effect-free, for Promise users:
  - `initTrpc`, `t.router`, `router`, `mergeRouters` and `lazy`;
  - `t.procedure` and its builder methods: `.input`, `.output`, `.meta`, `.errors` and `.use`;
  - resolvers returning values, Promises or async generators;
  - Promise middleware and its `opts.next()`;
  - `error()`, `ok()` and `TrpcError`;
  - the lifecycle helpers.

  A Promise user writes and types a router without importing `effect`. A change there goes to the human first.

- (agent) Everything else may be Effect-first where that's cleaner:
  - plugins and `t.concat` extensions;
  - handlers and adapters (`createFetchHandler`, the OpenAPI and v11 handlers, `serve`, Lambda, Cloudflare);
  - the runtime and lifetime surface (`runtime`, `Scope`, `dispose`);
  - links' internals and authoring;
  - the platform adapters.

  A Promise-friendly path stays where non-Effect users realistically touch it: `handler.fetch`, `dispose()`, `createContext`, `onError`, `createTrpcClient` and the links' options.

- (agent) This replaces the rule in [`effect-internal-patterns.md`](./effect-internal-patterns.md) that public APIs stay as they are. A public `dispose` or scope where something with a lifetime had none is fine. Each Effect-first change is an `(agent)` bullet in its topic's decision, listed in the type-surface diff, with its bundle and instantiation cost.
- Why: Effect owns lifetimes, interruption and services. Hiding it behind Promise-shaped options left scopes nobody could close and runtimes nobody could share. Router and procedure declaration are what every user writes, so they stay plain.
- Lost: a public API with no Effect types outside the router. Users of handlers, plugins or adapters may meet a `ManagedRuntime`, `Layer` or `Scope`, and keep a Promise path only where they realistically touch one.
- Lives in: `packages/trpc/src/server/procedures/` (the Effect-free declaration surface), `packages/trpc/src/server/handler/`, `src/client/links/`, `src/cloudflare/`, `src/aws-lambda/`, `src/actions/`; the changes made under it are listed in [`effect-internal-patterns.md`](./effect-internal-patterns.md).
