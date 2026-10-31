# Approach

How vNext gets designed and built. It covers the process for proposals and decisions, how agents use this folder, the design principles, the technical approach and the delivery phases.

## 1. Process: proposals → decisions → code

```text
proposal (proposed) ──► human decides ──► decision file ──► implementation ──► docs/examples
        │                     │
        └─ needs-research ◄───┘ (spike first, then re-propose)
```

### Statuses

| Status           | Meaning                                                       |
| ---------------- | ------------------------------------------------------------- |
| `proposed`       | Options and a recommendation are written; waiting for a human |
| `needs-research` | A spike or benchmark is needed before a decision is sensible  |
| `accepted`       | Decided; a file exists in `decisions/`                        |
| `rejected`       | Not doing it; the reason is recorded in `decisions/`          |
| `superseded`     | A later decision replaced it; links to the decision's file    |

### How a human decides

Use whichever is fastest:

- Tick boxes in a proposal's **Decision** block and add notes.
- Or reply in chat, for example `07: Q7.1 combined, Q7.3 [data, error], Q7.4 yes 400`.
- Partial decisions are fine. Unanswered questions stay open, and the recommendation is **not** assumed.

### What the agent does with a decision

1. Writes `decisions/<topic>.md`, or edits the topic's existing file, following [the format in `README.md`](./README.md#decisions). It quotes the answers and records what was lost and what is still open.
2. Updates the proposal: sets **Status**, links the decision's file, and leaves the options in place for history.
3. Updates `reference/orpc-parity.md` if any row's plan changed.
4. Ripples the decision into dependent proposals (the **Depends on** column). If a dependent recommendation no longer holds, the agent marks it and asks.
5. Commits: `docs(agent-docs): decide <topic>`. The commit message carries the longer reasoning; the file stays short.

### Challenging decisions

The [brief](./decisions/brief.md): "Old decisions should be challenged if needed." When implementation reveals a decision is wrong (types too slow, an API is awkward in practice), the agent:

- does **not** silently diverge;
- writes a short proposal that supersedes it, with the evidence (benchmark, code sample), and asks.

### The parity gate

The [brief](./decisions/brief.md): "Highlight anything and prompt user when we make API decisions that may stop us from getting there." Every proposal lists the [oRPC comparison](https://orpc.dev/docs/comparison) rows it touches. If a choice would turn a row's plan into 🛑, the proposal says so in a ⚠️ **Parity** callout, and the agent must get explicit confirmation before recording it. See `reference/orpc-parity.md` for the rows at risk.

## 2. How agents use this folder

This folder is the agents' docs folder that the [brief](./decisions/brief.md) asks for.

- **Search before acting:** `rg -n "<topic>" .agent-docs/` before designing or implementing anything. Decisions win over proposals, and proposals win over memory.
- **Write things down:**
  - research notes, spike results and benchmarks go in `notes/` (create `notes/<topic>.md`, with the date and what was measured);
  - new questions become proposals (copy `proposals/_template.md`).
- **Vendored sources:** read `.repos/effect` (effect@4.1.1) for how Effect really behaves. Never edit, format or import from `.repos/` (see `.repos/AGENTS.md`).
- **Effect APIs:** verify against `.repos/effect` before using them. Many remembered v3-era APIs do not exist in v4 (see `reference/prior-art.md`).
- **Keep it navigable:** one topic per file; link instead of repeating. The proposal table in `README.md` is the only index; decisions have none.

## 3. Principles

Taken from the [brief](./decisions/brief.md). Every proposal is judged against them.

1. **Effect inside, Promises outside.** All internal logic is Effect. Effect is first-class but never required: "You shouldn't need to know Effect to use tRPC."
2. **One dependency:** `effect`. Integrations with third-party peers (React, TanStack, Next) are separate packages; everything else is in `@trpc12/trpc`.
3. **Familiar, not compatible.** The procedure builder stays recognisable. Breaking changes are allowed; back-compat can come later via a protocol version header.
4. **Option bags** over multiple positional arguments, in values and in type parameters.
5. **Brutal deletion.** Start from scratch. Anything not deliberately kept is gone (`reference/v11-inventory.md`).
6. **No shortcuts to the best API.** Prefer a spike and a benchmark over a guess, and a well-typed design over a quick one.
7. **Parity with oRPC** is the bar, and blocking it requires sign-off.
8. **Portable types.** No TS2742, ever. CI proves it.
9. **Clear stability.** JSDoc on every public export, explicit stability tiers, and `experimental_` and `unstable_` prefixes on experimental and unstable values (21, [decision](./decisions/stability-jsdoc-tags.md)).
10. **Integration tests first.** Test through real handlers and clients, like `smoke.test.ts`. Packages may export test helpers (`@trpc12/trpc/testing`).

## 4. Technical approach

### Layers

| Layer        | Responsibility                                             | Effect usage                                        | Proposals  |
| ------------ | ---------------------------------------------------------- | --------------------------------------------------- | ---------- |
| Definition   | Builder, procedures, routers, contracts, schemas, errors   | Types; Effect Schema support                        | 03–09      |
| Execution    | Middleware chain, validation, resolver call, error mapping | Each call is an Effect; services via Layers; spans  | 02, 06, 07 |
| Protocol     | Encode/decode requests, responses, batches, streams        | `Stream` for streaming; serializer async on Effect  | 10, 11, 14 |
| Transport    | Fetch handler, Node, WebSocket, MessagePort, plugins       | Platform services and Layers; interruption on abort | 12, 13     |
| Client       | Proxy client, links, retries, subscriptions                | Link chain on `Stream`; `Schedule` for retries      | 16, 17     |
| Integrations | Server-side calls, actions, OpenAPI, TanStack Query, React | Mostly Promise-facing                               | 15, 18–20  |

The public surfaces of the definition and integration layers are Promise-first. Effect types only appear when the user opts in (02).

### Spikes before decisions

Some recommendations depend on measurements. These are run as throwaway spikes, recorded in `notes/` and linked from the proposal:

| Spike                                                                                   | Feeds          |
| --------------------------------------------------------------------------------------- | -------------- |
| Options-bag builder generic vs positional generics: tsgo trace on a 1k-procedure router | 03 (b)         |
| Link-informed call options (`router: type<AppRouter>()` vs curried)                     | 17 (c)         |
| Effect middleware that provides services (removing them from `R`)                       | 06 (g), 02 (b) |
| Returned-error inference through middleware chains and the client                       | 07             |
| danSON port on Effect + QP-C legible query params                                       | 11 (b), 11 (c) |
| Bundle size of a minimal client with Effect                                             | 02 (g)         |

### Testing

- **Integration tests** spin up a real handler and client in-process (`@trpc12/trpc/testing` provides `createTestServer`/`createTestClient`, using `await using` for cleanup). They cover HTTP, WebSocket and MessagePort.
- **Type tests:** `expectTypeOf` in Vitest for inference (inputs, outputs, errors, context, link options).
- **Benchmarks:** Vitest `bench` for the serializer and routing; tsgo traces for type performance.
- **Portability fixture** for TS2742 (01).
- v11's tests (`packages/tests/server`, `packages/client/src/__tests__`) are mined for behaviour cases: batching, abort, reconnection, the security fixes.

### Docs and examples

- User docs are Markdown in `www/docs/`, rendered by the site in `www/` with compiled examples ([`decisions/docs-website.md`](./decisions/docs-website.md)); design docs here.
- JSDoc on every public export, with `@example`, `@since` and `@stability` (21).
- A few examples linked via `workspace:*` (22). They are typechecked and built in CI.

## 5. Workflow

- **Branch:** `v12` on [trpc/trpc](https://github.com/trpc/trpc). `origin` → that repo. **Never push to `main`.** No force-pushes and no merge commits on `v12` (linear history). Catch up with `git pull --rebase origin v12`.
- **Code root:** all new implementation under `next/` (see `next/README.md`). `next/.agent-docs/` is design docs only.
- **Commits:** YOLO semantic commits straight to `v12` (`feat(server): …`, `docs(agent-docs): …`). No PRs for now.
- **Precommit hook** formats, lints and runs related tests on staged files (22).
- **Publishing:** none for now. Packages use the `@trpc12/trpc` name and `@trpc12/*` scope, and examples consume linked local packages.
- **Versioning:** Changesets, one version per package; a bump also releases every package that depends on the bumped one ([`decisions/versioning.md`](./decisions/versioning.md)).

## 6. Phases

| Phase | Goal                        | Exit criteria                                                                                                                                                                                  |
| ----- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | **Proposals** (this folder) | A human has decided 01, 02, 03, 07, 11 and 22 (the foundations); spikes are scheduled for the rest                                                                                             |
| 1     | Foundations                 | Implementation under `next/` (own pnpm workspace); Vite+ toolchain, CI and hook; `@trpc12/trpc` skeleton + portability fixture. Root v11 tree remains until a human decides to delete it (22). |
| 2     | Core server                 | Builder, procedures, validation, middleware, errors, routers, `createRouterClient`; Effect handlers; integration tests in-process                                                              |
| 3     | Protocol and transport      | Serializer, fetch/Node handlers, batching, streaming/SSE, WebSocket; plugins with secure defaults                                                                                              |
| 4     | Client                      | Proxy client, Effect link chain, `httpLink`, `wsLink`, typed link options; Effect client                                                                                                       |
| 5     | Integrations                | TanStack Query (agnostic), actions, contract-first, OpenAPI handler/generator/link                                                                                                             |
| 6     | Parity review and polish    | Every row in `reference/orpc-parity.md` is ✅ or explicitly deferred by a human; docs and examples complete                                                                                    |

### Decision order

Foundations first, because later proposals assume them:

1. **01** packages and **22** tooling: unblock phase 1.
2. **03** builder, **02** Effect model, **07** errors: shape every signature.
3. **11** serializer and **10** protocol: shape the wire.
4. **17** links and **16** client: the most visible client API.
5. The rest, in any order.

## 7. Risks

| Risk                                                                                     | Mitigation                                                                              |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Type-checking performance regresses (options-bag generics, error unions, link inference) | Benchmarks in spikes; contract types for clients (01); budgets in CI later              |
| Effect leaks into Promise users' types or errors                                         | Dedicated overloads; type tests asserting hovers for Promise-only usage (02)            |
| Bundle size for browser clients                                                          | Bundle sizes reported in CI; keep Schema and `effect/http` out of client paths          |
| Effect v4 churn (unstable modules)                                                       | Use stable APIs publicly; CI against the latest Effect minor (02 (h))                   |
| Scope creep from parity                                                                  | Parity rows can be explicitly deferred by a human; phases keep scope ordered            |
| Migration pain for v11 users                                                             | Familiar APIs; protocol version header; maybe a codemod later                           |
| Decisions drift from implementation                                                      | Agents search `decisions/` first and propose supersession instead of silently diverging |
