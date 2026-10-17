# Experiment: raf-query on Vue

Private Vue 3.5 bindings over `@raf-query/core`: composables (`useQuery`, `useWaterfall`, `useIsFetching`), `QueryPlugin` / `QueryClientProvider`, and `HydrationBoundary`, built on core's `QueryBinding`. Not published and not a docs topic yet — the draft guide lives in [`docs/`](./docs/).

| Path       | Package                       | Role                                                                 |
| ---------- | ----------------------------- | -------------------------------------------------------------------- |
| `package/` | `@raf-query/experimental-vue` | The bindings                                                         |
| `sample/`  | `@examples/experimental-vue`  | The Vue app (Vue Router, SSR entries) the guide's code is taken from |
| `docs/`    | —                             | Stashed `www` guide (not linked from the site)                       |

```shell
pnpm --filter @raf-query/experimental-vue test
pnpm --filter @examples/experimental-vue typecheck   # vue-tsc
```

## Making it real

1. Move `package/` to `packages/vue` as `@raf-query/vue`: give it the published fields the other packages have (`files`, `publishConfig`, `prepack`, `publish:npm`) and the lockstep version.
2. Add it to `.release-it.json`'s publish list, the CI pack-and-import check, the post-release links and npm trusted publishers.
3. Move `sample/` to `www/samples/vue` as `@samples/vue`, and add it to `www/package.json` and knip's `www` ignore list.
4. Move `docs/vue.md` into `www/content/` (its `sample` fences already point at `vue/…`) and list the package in the README, overview, installation page and API reference.
5. Remove this folder (or leave a short pointer in `.agent-docs/decisions/`).
