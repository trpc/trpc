# Ambiguous choices go the Effect-native way first, the v11 way second (human)

- Human, 2026-10-16: "if there's something ambiguous, do the most "effect native way" first, old trpc way second. Make sure decisions are recorded and searchable easily and so we know if a human did it consciously or not. Make sure the reference code in old trpc 11 or orpc is just for inspiration of features, the actual code should be written in Effect fashion".
- When a proposal or an Open item has no answer, the agent builds the option closest to how Effect does it: services and layers over globals, `Effect`/`Stream`/`Schema` over hand-rolled equivalents, typed failures over thrown ones, `Scope` for resources. If Effect has no idiom, v11's behaviour is the fallback.
- tRPC v11 (`v11/`) and oRPC ([`middleapi/orpc`](https://github.com/middleapi/orpc)) are references for which features to have, not for how to write them. Code follows the vendored Effect source's style (`.repos/effect`).
- Every such call is its own `decisions/<topic>.md` titled `(agent)`, or an `(agent)` bullet in a `(human)` file, so it reads as unreviewed. `pnpm decisions --who agent` and `pnpm decisions --agent-bullets` list them.
- Human, 2026-10-16: "i think we made a decision to move all code that we can in Effect (it should be in the AGENTS.md of next) yet, you wrote the tooling for the decision cli without effect add a task to rewrite this too". All logic is written in Effect, tooling included; the rule is in `AGENTS.md`.
  - (agent) Built, 2026-10-16. `tooling/decisions` uses `FileSystem` and `effect/cli`, and parse failures are a tagged `InvalidDecision` error. `tooling/pack` uses `FileSystem` and `ChildProcessSpawner`. Older spike scripts are rewritten when next touched. The oxlint plugin stays as it is: oxlint fixes its shape.
- Why: the agent can keep building without waiting on each question, and every unreviewed call stays visible for a human to accept or reverse.
- Lost: a human picking each option before it's built; some agent calls will be rewritten.
- Lives in: `.agent-docs/README.md#decisions`, `tooling/decisions/` (`pnpm decisions`, and the format check in `decisions.test.ts`).
