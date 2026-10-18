# tRPC vNext: design proposals

This folder (`next/.agent-docs/`) holds the **design** work for the next version of tRPC, following the [brief](./decisions/brief.md). **Implementation lives in the rest of [`next/`](../)** — do not put new packages in the repo-root `packages/` tree. Paths such as `.repos/effect` or `spikes/` are relative to `next/`.

It contains:

- **[`approach.md`](./approach.md):** how we work. It covers the process, how agents use this folder, principles, the technical approach, phases and risks. Start here.
- **[`proposals/`](./proposals):** one file per API area. Each has today's v11 behaviour, options with code sketches, a recommendation, numbered questions and a blank **Decision** block.
- **[`decisions/`](./decisions):** one file per decided topic (see [Decisions](#decisions)).
- **[`reference/`](./reference):** shared background.
  - [`orpc-parity.md`](./reference/orpc-parity.md): the oRPC comparison table mapped to proposals, and the decisions that could block parity.
  - [`v11-inventory.md`](./reference/v11-inventory.md): what v11 ships, and whether each item is kept, changed or deleted.
  - [`prior-art.md`](./reference/prior-art.md): abandoned tRPC PRs, danSON, Effect v4 and oRPC.
- **[`notes/`](./notes):** agent working notes and spike results.

## How to decide

Tick boxes in a proposal's **Decision** block, or reply in chat, for example `07: Q7.1 combined, Q7.3 [data, error]`. Partial answers are fine; anything unanswered stays open. The agent records each decision in `decisions/` and ripples it through dependent proposals. Full process in [`approach.md`](./approach.md#1-process-proposals--decisions--code).

Or say "decision round": the agent asks open items one at a time with a progress count. Answer with a letter or your own words, `skip` leaves it to the agent's best call, `done` stops and implements everything so far. See [`.agents/skills/decision-round/SKILL.md`](../../.agents/skills/decision-round/SKILL.md).

## Decisions

Many changes land in parallel, so each decision is its own file and two changes rarely touch the same one.

- **A new decision is a new file:** `decisions/<topic>.md`, kebab-case, named by topic. No dates or sequence numbers in the name (parallel changes would pick the same number), and no index file (every change would edit it).
- **Changing a decision edits its file; reversing one rewrites or deletes it.** Superseded text doesn't pile up; git keeps it.
- **Each file starts with `# Title (who)`:**
  - `(human)`: a human decided it. Don't reverse it without asking.
  - `(human asked)`: a human asked for the outcome; the agent chose the details. The outcome is the human's, the details are open to revision.
  - `(agent)`: a judgement call, open to revision with a good reason.

  Within a file, a bullet starting `(agent)` is the agent's call even when the title is `(human)`. A `Tentative (human):` bullet marks a human answer given with doubt ("I don't really get this right now"): treat it as `(human)`, but challenge it when it gets in the way.

- **The body is short bullets:** what was decided (quote the human verbatim as `Human, <date> (Q7.2): "…"`; never their name, git has it), **Why**, **Lost** (the alternatives given up and their cost), **Open** (what's left), and **Lives in** (the files that implement it).
- **Find decisions** with `pnpm decisions` (from `next/`). It lists every decision with who made it and the questions it answers:
  - `pnpm decisions <regex>` searches the decisions' text.
  - `--who human|asked|agent` filters by who decided.
  - `--open` prints what each one leaves open.
  - `--tentative` lists human answers flagged as tentative.
  - `--agent-bullets` also lists the agent's calls inside `(human)` files.
  - `--questions` lists every proposal question (`Q7.2`) with the decisions that cite it and who made them. A test fails when a question has none, so every answered question is findable by its number.

  `rg -n "<topic>" .agent-docs/decisions/` works too. `tooling/decisions/decisions.test.ts` checks every file has a title marker and a `Lives in` bullet, and that its links resolve.

- **Ambiguous questions** go the Effect-native way first, v11's second ([`effect-native-by-default.md`](./decisions/effect-native-by-default.md)); each such call is marked `(agent)`.

## Digging deeper with git

Decision files hold the current answer; the reasoning behind earlier versions lives in history.

- `git log -p -- .agent-docs/decisions/<topic>.md`: how a decision changed, and the commit messages explaining why.
- `git blame -C -C .agent-docs/decisions/<topic>.md`: which commit wrote each line, following text moved between files (decisions used to be numbered `NNNN-*.md` logs).
- `git log -S '<phrase>' -- .agent-docs/`: when a phrase or option name appeared or disappeared.
- `git blame -L <start>,<end> -- <file>`: who last changed a block of code a decision points to.

## Already decided in the brief

These are treated as given:

- Effect is the only dependency.
- One package called `@trpc12/trpc` with `/server`, `/client`, … subpaths. Integrations with external dependencies are separate packages.
- Transformers move to endpoints.
- `@trpc/react-query` is dead.
- Markdown docs only.
- The `@trpc12` npm scope, with no releases yet.
- `v12` branch on trpc/trpc, with semantic commits and no PRs.

## Proposals

| #   | Proposal                                                                           | Recommendation in one line                                                                                                                                 | Parity-critical | Qs  |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------------: | --- |
| 01  | [Packages and type portability](./proposals/01-packages-and-type-portability.md)   | `@trpc12/trpc` with subpaths, `@trpc12/*` integrations, `effect` as a dependency, TS2742 rules + CI fixture                                                |                 | 5   |
| 02  | [Effect integration](./proposals/02-effect-integration.md)                         | Effect internals, Promise surface by default; same builder accepts Effect handlers; services declared at the root; strict `E` mapping                      |                 | 4   |
| 03  | [Builder and init](./proposals/03-builder-and-init.md)                             | `initTrpc<{ ctx; meta }>()`, options-bag builder generic (benchmark first), closed builder over an internal generic core, contract/implementation split    |       ⚠️        | 6   |
| 04  | [Procedures](./proposals/04-procedures.md)                                         | Keep query/mutation/subscription; resolver options bag; mutable `response` handle; first-class `.route()`                                                  |       ⚠️        | 5   |
| 05  | [Validation and schemas](./proposals/05-validation-and-schemas.md)                 | Standard Schema + native Effect Schema only; no `type<T>()`; keep input chaining; ctx callback + Effect services; Standard JSON Schema                     |                 | 6   |
| 06  | [Context and middleware](./proposals/06-context-and-middleware.md)                 | Keep `next({ ctx })`; `ok()` short-circuit; standalone dependency-declaring middleware; lifecycle helpers; no router-level middleware                      |                 | 6   |
| 07  | [Errors](./proposals/07-errors.md)                                                 | Returned/inferred errors (incl. Effect `E`) + optional declared map + mapping middleware; one isomorphic `TrpcError` with `defined`                        |       ⚠️        | 7   |
| 08  | [Routers](./proposals/08-routers.md)                                               | Plain objects; optional `t.router()` for prefix/tags; keep `lazy()`; drop `mergeRouters`                                                                   |                 | 4   |
| 09  | [Contract-first](./proposals/09-contract-first.md)                                 | Contract builder with resolver-less terminals + `t.implement(contract)`; `inferContract` + `toContract()`                                                  |       ⚠️        | 4   |
| 10  | [Wire protocol](./proposals/10-wire-protocol.md)                                   | New path-based protocol, no envelopes, HTTP status errors, opt-in streamed batching, one message model for WebSocket/MessagePort, version header           |       ⚠️        | 6   |
| 11  | [Serialization, query params and files](./proposals/11-serialization-and-files.md) | Port **danSON** into `@trpc12/trpc/serializer` (rich types + streaming at any depth); legible bracket-notation GET params; files as multipart-backed types |       ⚠️        | 6   |
| 12  | [Handlers, adapters and platforms](./proposals/12-handlers-adapters-platforms.md)  | Create-once web-standard handler; platform services via Effect Layers; thin adapters; no third-party dependencies                                          |       ⚠️        | 4   |
| 13  | [Plugins](./proposals/13-plugins.md)                                               | One plugin interface (`onRequest`/`onCall`); body limit, strict methods and CSRF on by default                                                             |                 | 4   |
| 14  | [Subscriptions and streaming](./proposals/14-subscriptions-and-streaming.md)       | Async iterables/Streams; `tracked()` with `lastEventId` in options; fetch-based SSE; hibernation-ready                                                     |                 | 7   |
| 15  | [Server-side calls and actions](./proposals/15-server-side-calls-and-actions.md)   | `createRouterClient` (direct calls), `call()`, opt-in `callable()`/`action()` wrappers with typed results                                                  |                 | 4   |
| 16  | [Client](./proposals/16-client.md)                                                 | Keep verbs; positional input + options bag; typed context; AsyncIterable subscriptions; `safe()`                                                           |                 | 6   |
| 17  | [Links](./proposals/17-links.md)                                                   | Effect link chain with Promise authoring; links declare typed call options (`router: type<AppRouter>()`); one `httpLink`                                   |                 | 5   |
| 18  | [OpenAPI](./proposals/18-openapi.md)                                               | OpenAPI handler + Standard JSON Schema generator, `.route()`, bracket notation, coercion, Scalar; `openApiLink`                                            |       ⚠️        | 5   |
| 19  | [TanStack Query](./proposals/19-tanstack-query.md)                                 | Framework-agnostic `@trpc12/tanstack-query` with option bags, explicit infinite input, streamed/live options                                               |       ⚠️        | 6   |
| 20  | [React `use()` package](./proposals/20-react-use-package.md)                       | Defer; keep link-based caching possible                                                                                                                    |                 | 3   |
| 21  | [Stability and JSDoc](./proposals/21-stability-and-jsdoc.md)                       | `@since`/`@stability` JSDoc + experimental entry points, no name prefixes, CI-enforced                                                                     |                 | 5   |
| 22  | [Tooling, CI and repo](./proposals/22-tooling-ci-and-repo.md)                      | Vite+ (`vp`) toolchain, TS 7, `vp staged` precommit hook, one CI workflow, fresh layout                                                                    |                 | 5   |
| 24  | [Error ownership](./proposals/24-error-ownership.md)                               | Closed client error union, exhaustive `matchError()`, TanStack error shells that subtract the failures they own (after result-rpc)                         |                 | 8   |

⚠️ marks proposals where some options would block a row in the [oRPC parity matrix](./reference/orpc-parity.md).

## If you only answer a few questions

These have the most leverage: they shape every other proposal and every code sample.

1. **Q3.3** Generic builder: an internal generic core with a closed public builder and opt-in wrappers (recommended), or a public extension API?
2. **Q2.1** Effect handlers in the same builder (recommended), or a separate Effect flavour?
3. **Q7.1** Error model: returned/inferred errors + optional declared map + mapping middleware (recommended)?
4. **Q11.1 / Q11.3** danSON as the serializer, and which legible GET encoding?
5. **Q10.1 / Q10.2** New protocol? `/post/byId` or `/post.byId`?
6. **Q17.3** How links inform call options: `createTrpcClient({ router: type<AppRouter>(), links })`, curried, or a second generic?
7. **Q9.1** Contract syntax: resolver-less `.query()` terminals?
8. **Q12.1** Own web-standard core with Effect platform Layers (recommended), or build on `effect/http`?
9. **Q16.1 / Q19.2** Client calls `query(input, opts)` and TanStack `queryOptions({ input })`?
10. **Q22.1** Vite+ as the single toolchain?

## Parity-critical decisions

Getting these wrong would block rows of the oRPC comparison (details in [`orpc-parity.md`](./reference/orpc-parity.md#the-decisions-that-matter-most-for-parity)):

- **Contract and implementation must be separable** in the procedure data model (03, 09). This affects contract-first, the OpenAPI link and NestJS.
- **Serialization lives on endpoints, not the router** (11). One router must serve RPC and OpenAPI.
- **The protocol and handler must not assume HTTP** (10, 12). This affects MessagePort and WebSocket hibernation.
- **Per-procedure HTTP route metadata** (04, 18). This affects OpenAPI.
- **A framework-agnostic TanStack integration** (19). This affects Vue, Solid, Svelte and Angular.
