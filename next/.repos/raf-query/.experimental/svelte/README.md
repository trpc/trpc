# Experiment: raf-query on Svelte

Private Svelte 5 bindings over `@raf-query/core`, built on runes: `useQuery`, `useWaterfall`, `useIsFetching`, `QueryClientProvider` / `setQueryClient`, and `HydrationBoundary`, built on core's `QueryBinding`. Not published and not a docs topic yet — the draft guide lives in [`docs/`](./docs/).

| Path       | Package                          | Role                                                                         |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `package/` | `@raf-query/experimental-svelte` | The bindings                                                                 |
| `sample/`  | `@examples/experimental-svelte`  | The SvelteKit app (server `load`s, hydration) the guide's code is taken from |
| `docs/`    | —                                | Stashed `www` guide (not linked from the site)                               |

```shell
pnpm --filter @raf-query/experimental-svelte test
pnpm --filter @raf-query/experimental-svelte build      # svelte-package, what a release would ship
pnpm --filter @examples/experimental-svelte typecheck   # svelte-kit sync && svelte-check
```

The sample's `prepare` script runs `svelte-kit sync` on install: its `tsconfig.json` extends the generated `$app/tsconfig`, which lint and knip load.

## Making it real

1. Move `package/` to `packages/svelte` as `@raf-query/svelte`: give it the published fields the other packages have (`files`, `prepack`, `publish:npm`, and `publishConfig.exports` pointing at `svelte-package`'s `dist/` with a `svelte` condition) and the lockstep version.
2. Add it to `.release-it.json`'s publish list, the CI pack check (the tarball must ship `dist/` `.svelte` files), the post-release links and npm trusted publishers.
3. Move `sample/` to `www/samples/sveltekit` as `@samples/sveltekit`, add it to `www/package.json` and knip's `www` ignore list, and have the www build run `svelte-kit sync` for it before Twoslash (so `./$types` resolves). The route-tree step must then skip apps whose `src/routes` has no `__root.tsx`.
4. Move `docs/svelte.md` into `www/content/` (its `sample` fences already point at `sveltekit/…`) and list the package in the README, overview, installation page and API reference.
5. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
