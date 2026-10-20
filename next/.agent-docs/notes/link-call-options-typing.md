# Link-informed call options: D-A / D-B / D-C / D-E repros

- **Date:** 2026-10-09
- **Question:** Which `createTRPCClient` shapes let links declare typed call options (`query(input, { ignoreCache: true })` only with `cacheLink()`) and context, and what breaks in each?
- **Feeds:** [17 — Links](../proposals/17-links.md) (Q17.3, Q17.5)
- **Code:** [`next/spikes/link-options/`](../../spikes/link-options/). `link-options.test-d.ts` ran in `pnpm test` (Vitest typecheck) until the feature shipped; git has it.

## Model

```ts
interface TRPCLink<TDecl extends { options?: object; context?: object } = {}, TRouter = any> {
  readonly '~types'?: { decl: (d: TDecl) => TDecl; router: TRouter }; // phantom
  (op: Operation): Promise<unknown>;
}
cacheLink(): TRPCLink<{ options: { ignoreCache?: boolean } }>;
httpLink(opts): TRPCLink<{ context: { headers?: Record<string, string> } }>;
splitLink<TRouter>({ condition: (op: Operation<RouterPaths<TRouter>>) => boolean, true, false });
```

`CallOptions<TLinks>` = intersection of every link's `options` (top level, F-A) plus `{ signal?, context?: intersection of every link's context }` (F-B). Both placements are expressible with the same declaration.

## Results

| Shape                                                                                             | Options typed |         `splitLink` `op.path` typed inline         | Forgetting something                                  | Notes                                                                     |
| ------------------------------------------------------------------------------------------------- | :-----------: | :------------------------------------------------: | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| **D-A** `createTRPCClient<AppRouter>()({ links })`                                                |      ✅       |                         ✅                         | n/a                                                   | Simplest signature                                                        |
| **D-B** `createTRPCClient<AppRouter, typeof links>({ links })`                                    |      ✅       | ❌ (links are declared before the router is known) | Omitting `typeof links` → options are rejected (loud) | `const links = [...]` without `as const` is fine                          |
| **D-C** `createTRPCClient({ router: type<AppRouter>(), links })`                                  |      ✅       |                         ✅                         | n/a                                                   | A link typed for another router is rejected                               |
| **D-E** `const c: TRPCClient<AppRouter, CallOptions<typeof links>> = createTRPCClient({ links })` |      ✅       |                  ❌ (same as D-B)                  | Unannotated → `unknown`                               | **Unsound by default**: the annotation can claim options no link provides |

Type cost of merging link declarations, 1k-procedure router (positional builder from the builder spike), client calling every procedure with options, 5 links including a `splitLink`, `--singleThreaded`, median of 5 (`node link-options/bench.ts`):

| client                                         | instantiations |  check |
| ---------------------------------------------- | -------------: | -----: |
| plain `createClient<AppRouter>()` (no options) |        198 995 | 0.163s |
| D-A                                            |        213 798 | 0.180s |
| D-C                                            |        213 753 | 0.181s |

Merging is computed once per client, not per procedure: about **+7% instantiations, +10% check time**, and D-A and D-C cost the same.

## Findings

1. **D-A and D-C both work with no partial-inference tricks.** D-C needs neither `const` type parameters nor `NoInfer`: `TRouter` comes from `router`, `TLinks` from `links`, and router-aware link factories written inline get `TRouter` through return-type contextual inference.
2. **The link phantom must be invariant in its declaration.** With a covariant phantom (`decl: TDecl`), a link that declares nothing (`loggerLink()`) is a supertype of every other link. `[cacheLink(), loggerLink(), httpLink()]` is then reduced by subtype reduction to `TRPCLink<{}>[]` and `ignoreCache` disappears. This hit D-A without `const` and D-B with `const links = [...]`. An invariant phantom (`decl: (d: TDecl) => TDecl`) fixes it for every shape; there is a regression test.
3. **D-B's "silently loses options" risk depends on the default.** With `TLinks = readonly AnyLink[]` and a merge that ignores `any` declarations, forgetting `typeof links` is a compile error at the call site (`'ignoreCache' does not exist in type 'CallOptions<readonly AnyLink[]>'`). A default that merges to `any` would be silent.
4. **D-E can be made sound** with return-type inference: `createTRPCClient<TClient, TLinks>(opts: { links: TLinks & MissingLinkOptions<TLinks, OptsOf<TClient>> }): TClient`. The error is readable enough: `Type '[TRPCLink<{}, any>]' is not assignable to type '… & { '~missingLinkOptions': "retries" }'`. It still needs the link types written twice.
5. **Links declared outside the client call cannot see the router** (D-B, D-E): `splitLink`'s `op.path` is `string` unless the user writes `splitLink<AppRouter>(…)`.
6. Error messages print `CallOptions<readonly [TRPCLink<…>, …]>` instead of the resolved object. A `Simplify` (or an interface) on the final call-options type would make them readable; not tried.

## Not covered

- D-D (global `Register`): not reproduced; its multi-client problem is structural, not a type-checking question.
- Runtime behaviour (option values reaching the link) and links that _add_ runtime methods to the client (#5498's "decoration").
- Hover quality in an editor.
