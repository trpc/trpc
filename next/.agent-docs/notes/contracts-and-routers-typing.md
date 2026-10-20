# Contracts and routers typing (09, 08)

- **Date:** 2026-10-09
- **Question:** Can 09's contract builder and `t.implement()` check completeness and outputs with readable errors, and what does contract-first cost compared with implementation-first? Do 08's plain-object routers support duplicate-key checks on merge and `lazy()`?
- **Feeds:** [09 — Contract-first](../proposals/09-contract-first.md) (Q9.1, Q9.2), [08 — Routers](../proposals/08-routers.md) (Q8.1, Q8.2).
- **Code:** [`next/spikes/contracts/`](../../spikes/contracts/). `core.ts` is a `declare`-only prototype, and `contracts.test-d.ts` (12 type tests) ran in `pnpm test` until the feature shipped; git has it. Typeperf: `node contracts/bench.ts [n] [runs]` in `next/spikes`. TypeScript 7.0.2.

## Contract-first (09)

- **Q9.1:** The terminal form (`c.input(…).output(…).errors(…).query()`) and the options-bag form (`c.procedure({ type: 'query', input, output, errors, route })`) produce _identical_ types. A test asserts `toEqualTypeOf`. The choice between them is purely about syntax.
- **`t.implement(contract)`** gives a mirror tree. Each leaf only has `.use()` and the matching terminal, with input, output and the error constructors pre-typed. All of these are errors:
  - `.mutation()` on a query contract (TS2339);
  - `.input()` on a leaf (TS2339);
  - a wrong output (TS2322 on the resolver, naming the missing `title`).
- **`impl.router()` completeness.** If `router()` is _not generic_ (it takes `ImplementedRouter<TContract>` directly), the usual object-literal checks do the work:
  - a missing procedure is TS2741 ("Property 'create' is missing");
  - an extra key, at any depth, is TS2353 ("'delete' does not exist in type …");
  - a procedure in the wrong slot is TS2322.

  A generic `router<const R extends …>(r: R)` loses the excess-property check, so extra keys would pass silently.

- **`inferContract<typeof implRouter>` equals `typeof appContract`.** For implementation-first routers, `inferContract` drops `ctx` and unwraps `lazy`. `createClient<typeof router>()` and `createClient<inferContract<typeof router>>()` are the same type.
- **Q9.2 (b) `t.procedure.implements(contract.x)`** types each procedure just as well. However, completeness then needs a separate `satisfies ImplementedRouter<typeof contract>` on the router. Without it, a missing procedure is silent.

**Typeperf.**

- Setup: 1k and 2k procedures, 10 per file. Half are queries with input; half are mutations, which carry an error map on the contract side.
- `impl-first`: plain procedures, client built from `typeof appRouter`.
- `contract`: a contract file per router file, `t.implement()` per file and a top-level `impl.router()`, client built from `typeof appContract`.
- Median of 5 runs (3 for 2k).

| variant      | procedures |   types | instantiations | memory | check |
| ------------ | ---------: | ------: | -------------: | -----: | ----: |
| `impl-first` |       1000 |  52,083 |        250,614 | 103 MB | 0.21s |
| `contract`   |       1000 |  67,253 |        335,791 | 118 MB | 0.28s |
| `impl-first` |       2000 | 103,483 |        500,414 | 156 MB | 0.51s |
| `contract`   |       2000 | 133,753 |        670,491 | 186 MB | 0.70s |

Contract-first costs about 30–35% more and scales linearly. It is not a reason to avoid K-A.

## Routers (08)

- **Plain objects work.** Client and contract types come straight from `typeof router`.
- **Spread can't detect duplicate keys, at the type level or at runtime.** `{ ...a, ...b }` silently takes `b`'s `y`, and once spread, the duplicate is gone at runtime too, so `createHandler()` can't check it either. TS only reports TS2783 for an _explicit_ key followed by a spread that contains it (`{ y, ...b }`). The proposal's "duplicate keys are a type error through a `Router` constraint helper and are checked at runtime" therefore needs a merge function, such as a variadic `mergeRouters(a, b, …)` that computes the overlapping keys and errors on them (prototyped, TS2345 naming `"y"`). Q8.2 is really: accept silent overwrite with spread, or keep a merge helper.
- **`lazy(() => import('./admin'))`** picks up the `default` export through `T extends { default: infer D }`. A named export is picked with `.then((m) => m.adminRouter)`. The client and `inferContract` unwrap `Lazy<T>`.
