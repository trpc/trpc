# 0017 — Integrations that add dependencies are their own packages

| Proposal                                                                                        | Date       | Status   | Supersedes                                                          | Superseded by |
| ----------------------------------------------------------------------------------------------- | ---------- | -------- | ------------------------------------------------------------------- | ------------- |
| [01](../proposals/01-packages-and-type-portability.md), [19](../proposals/19-tanstack-query.md) | 2026-10-11 | accepted | [0016](./0016-agent-judgement-calls-tanstack-query.md) Q19.1 layout | —             |

## Decision

- Alex: "One package, one subpath per framework applies when there's no other deps. In the here we have both tanstack and react as peer dependencies".
- A subpath is only for code whose dependencies the package already has. An integration that brings its own (peer) dependencies is a separate `@trpcdev/*` package.
- TanStack Query is split by framework adapter:

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

- Each framework package depends on `@trpcdev/tanstack-query` and re-exports it, so an app imports from one package. The names mirror TanStack's own (`@tanstack/react-query` → `@trpcdev/tanstack-react-query`).

## Rationale

Optional peers on subpaths still show up in every install: package managers warn or auto-install them, and a user of one framework sees the other six in the package's `peerDependencies`. Separate packages give each framework accurate, required peers.

What we give up: seven more packages to version and publish.

## Rejected alternatives

- One package with optional peers per subpath (0016's original layout).

## Parity impact

The TanStack Query rows in `../reference/orpc-parity.md` now name the framework packages. Status is unchanged.

## Follow-ups

- [x] Split `packages/tanstack-query` into one package per adapter.
- [x] Proposal 19's build note and the README name the packages.
- [ ] Pinia Colada, when built, is `@trpcdev/pinia-colada`.
