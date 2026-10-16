# Inline generic factory makers infer (agent)

- `QueryFactory`'s input is a bivariant method parameter typed `unknown`, not `(input: never)`. The verbs' `TFactory extends QueryFactory` is the contextual type for an inline `makeFactory(x)` call, so TypeScript inferred the maker's own type parameters against it, and `never` won as a contravariant candidate. The input then became `never` (TS2345). Callers had to return `NoInfer<…>` from their makers.
- `ensure` / `fetch` with `{ pages }` is a second overload, `<TFactory extends PagedQueryFactory>(factory, input, options: LoadOptions)`, and `LoadOptions` isn't generic. Any later parameter whose type depends on `TFactory` (as the old `LoadOptions<TFactory>`, through `IsPaged`) makes an inline maker call fall back to the constraint, even under `NoInfer`. The paged constraint keeps `pages` a type error for plain factories. Found by dogfooding isbabyoutyet's `convexPaginatedQuery`.
- Lost: `input: any` (works, but the repo bans explicit `any`), and documenting `NoInfer` for every maker.
- Tests: `packages/react/src/types.test.ts` ("infer generic factory makers passed inline").
