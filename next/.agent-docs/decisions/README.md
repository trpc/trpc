# Decisions

The decision log for vNext. One file per decision, `NNNN-<slug>.md`, numbered in the order the decisions were made. The agent writes the file after Alex answers a proposal's questions (see `../approach.md`).

Decisions are never edited after the fact except to add a "Superseded by" link. To change a decision, write a new one that supersedes it.

## Log

| #                                                         | Decision                                                                      | Proposal                                               | Date       | Status      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- | ----------- |
| [0001](./0001-trpc-definition-key.md)                     | `'~trpc'` replaces `_def` (Q3.4)                                              | [03](../proposals/03-builder-and-init.md)              | 2026-10-09 | accepted    |
| [0002](./0002-meta-in-resolvers.md)                       | Resolvers receive `meta` (Q4.5)                                               | [04](../proposals/04-procedures.md)                    | 2026-10-09 | accepted    |
| [0003](./0003-mask-unexpected-errors.md)                  | Mask unexpected error messages in production (Q7.5)                           | [07](../proposals/07-errors.md)                        | 2026-10-09 | accepted    |
| [0004](./0004-effect-dependency-and-integration-names.md) | `effect` is a dependency `^4.0.0`; integrations are `@trpcdev/*` (Q1.1, Q1.3) | [01](../proposals/01-packages-and-type-portability.md) | 2026-10-09 | accepted    |
| [0005](./0005-websocket-standard-interface.md)            | WebSocket handler takes a standard `WebSocket` (Q12.4)                        | [12](../proposals/12-handlers-adapters-platforms.md)   | 2026-10-09 | accepted    |
| [0006](./0006-fetch-sse.md)                               | Fetch-streamed SSE, following the SSE standard (Q14.5)                        | [14](../proposals/14-subscriptions-and-streaming.md)   | 2026-10-09 | accepted    |
| [0007](./0007-vendor-src-and-root-dependencies.md)        | Keep `vendor-src`; workspace-root packages are `dependencies` (Q22.3)         | [22](../proposals/22-tooling-ci-and-repo.md)           | 2026-10-09 | accepted    |
| [0008](./0008-tanstack-option-bag.md)                     | TanStack Query option bag (Q19.2)                                             | [19](../proposals/19-tanstack-query.md)                | 2026-10-09 | accepted    |
| [0009](./0009-contract-terminal-syntax.md)                | Contracts use resolver-less terminals (Q9.1)                                  | [09](../proposals/09-contract-first.md)                | 2026-10-09 | accepted    |
| [0010](./0010-router-merge-helper.md)                     | Keep a router merge helper that rejects duplicates (Q8.2)                     | [08](../proposals/08-routers.md)                       | 2026-10-09 | accepted    |
| [0011](./0011-since-prerelease.md)                        | `@since` uses the v12 prerelease version (Q21.2)                              | [21](../proposals/21-stability-and-jsdoc.md)           | 2026-10-09 | accepted    |
| [0012](./0012-no-unvalidated-type-helper.md)              | No `type<T>()` or plain-function parsers (Q5.2)                               | [05](../proposals/05-validation-and-schemas.md)        | 2026-10-09 | accepted    |
| [0013](./0013-root-init-option-bag.md)                    | Root init is `initTRPC<{ … }>()`, no `.create()` (Q3.1)                       | [03](../proposals/03-builder-and-init.md)              | 2026-10-10 | accepted    |
| [0014](./0014-keep-t-object.md)                           | Keep `t`; plugin packages must work through `.concat()` (Q3.5)                | [03](../proposals/03-builder-and-init.md)              | 2026-10-10 | accepted    |
| [0015](./0015-agent-judgement-calls-v12-build.md)         | Agent judgement calls for the first v12 build                                 | several                                                | 2026-10-10 | provisional |
| [0016](./0016-agent-judgement-calls-tanstack-query.md)    | Agent judgement calls for the TanStack Query integration                      | [19](../proposals/19-tanstack-query.md)                | 2026-10-11 | provisional |
| [0017](./0017-integration-packages-per-dependency.md)     | Integrations that add dependencies are their own packages                     | [01](../proposals/01-packages-and-type-portability.md) | 2026-10-11 | accepted    |
| [0018](./0018-platforms-through-effect-layers.md)         | `trpcdev` imports no Node; platforms come from Effect layers                  | [12](../proposals/12-handlers-adapters-platforms.md)   | 2026-10-11 | accepted    |

## Template

```md
# NNNN — <Title>

| Proposal                        | Date       | Status   | Supersedes | Superseded by |
| ------------------------------- | ---------- | -------- | ---------- | ------------- |
| [NN](../proposals/NN-<slug>.md) | YYYY-MM-DD | accepted | —          | —             |

## Decision

- **QNN.1:** <answer, quoted from Alex>
- **QNN.2:** <answer>

## Rationale

Why, in Alex's words where possible. Note what we give up.

## Rejected alternatives

- <option>: <reason>

## Parity impact

Rows in `../reference/orpc-parity.md` affected, if any.

## Follow-ups

- [ ] <work item / proposal to update>
```
