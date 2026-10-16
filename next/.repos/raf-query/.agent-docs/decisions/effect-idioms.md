# Effect example follows Effect's own idioms (human asked, agent reviewed)

- Human: "see if we align with how to use effect effectively" against `.repos/effect` (`LLMS.md`, `ai-docs/src`).
- Reusable Effect functions are `Effect.fn("name")`, with combinators as extra arguments, never `.pipe` on the result (`LLMS.md`). Loaders, actions and RPC handlers all follow this; handler spans are named `IssueRpcs.<Procedure>`.
- Failing: `return yield* new IssueNotFound(...)` inside the generator, as in `ai-docs/src/51_http-server/fixtures/server/Users.ts`. No `flatMap(x ? succeed : fail)` ternaries.
- Human: "Do yield\* if that's more effect"; `.repos/effect` is the source of truth for Effect patterns, over earlier decisions here.
- Inside a generator (`Effect.gen`, `Effect.fn`): `const issues = yield* Issues`, then `yield* issues.UpdateTitle(input)`. Never `yield* Issues.use(...)`: in `.repos/effect` that's about 1,758 `const x = yield* Service` to 37 `yield* X.use(`.
- `Service.use(f)` only as a whole expression, outside a generator: one-call `queryFn`s, `runPromise(Service.use(...))` at a framework edge, constants like `invalidateIssues`. Same as `DecisionModel.decide` in `packages/effect/src/ai/DecisionModel.ts` and `ai-docs/src/04_integration/10_managed-runtime.ts`. A `() => Effect.gen(...)` that only yields a service is what `LLMS.md` says to avoid.
- A step shared by several Effects is an Effect value, not a copy: `invalidateIssues` in `src/queries.ts`.
- `retry` is a shared `Schedule` (`retryUnlessNotFound`): `Schedule.exponential` + `Schedule.while` on `step.input`, which is what core builds from a predicate anyway. A named predicate would need an `unknown` parameter, which `anti-slop/no-unknown-parameters` rejects, and `RetryPolicy` isn't exported from `@raf-query/react`.
