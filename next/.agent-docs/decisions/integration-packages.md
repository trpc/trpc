# Integrations with their own dependencies are `@trpcdev/*` packages (human)

- Human, 2026-10-09 (Q1.3): "yes". Integration packages are scoped `@trpcdev/*`, not unscoped `trpcdev-*`.
- Human, 2026-10-11: "One package, one subpath per framework applies when there's no other deps. In the here we have both tanstack and react as peer dependencies". A subpath of `trpcdev` is only for code whose dependencies `trpcdev` already has. An integration that brings its own (peer) dependencies is a separate package.
- TanStack Query is one package per TanStack adapter, named after TanStack's own (`@tanstack/react-query` → `@trpcdev/tanstack-react-query`):

  | Package                           | Peers besides `trpcdev`                                 |
  | --------------------------------- | ------------------------------------------------------- |
  | `@trpcdev/tanstack-query`         | `@tanstack/query-core`                                  |
  | `@trpcdev/tanstack-react-query`   | `@tanstack/react-query`, `react`                        |
  | `@trpcdev/tanstack-preact-query`  | `@tanstack/preact-query`, `preact`                      |
  | `@trpcdev/tanstack-vue-query`     | `@tanstack/vue-query`, `vue`                            |
  | `@trpcdev/tanstack-solid-query`   | `@tanstack/solid-query`, `solid-js`                     |
  | `@trpcdev/tanstack-svelte-query`  | `@tanstack/svelte-query`, `svelte`                      |
  | `@trpcdev/tanstack-angular-query` | `@tanstack/angular-query-experimental`, `@angular/core` |
  | `@trpcdev/tanstack-lit-query`     | `@tanstack/lit-query`, `lit`, `@lit/context`            |

- (agent) This answers Q19.1 (proposal 19): per-framework packages, not one agnostic package with `./react`.
- (agent) Each framework package depends on `@trpcdev/tanstack-query` and re-exports it, so an app imports from one package.
- Why: optional peers on subpaths still show up in every install. Package managers warn about or auto-install them, and a user of one framework sees the other six in `peerDependencies`. Separate packages give each framework accurate, required peers.
- Lost: one package with optional peers per subpath (the first TanStack build's layout). Seven more packages to version and publish.
- Human, 2026-10-15 (Q19.6): "Later or never". Pinia Colada isn't planned; if it is ever built, it is `@trpcdev/pinia-colada`.
- Lives in: `packages/tanstack-*/package.json`.
