# Bundle size measurement (human asked)

- Measure with `pnpm bundle-size` (`tooling/bundle-size`, `src/measure.ts`; `--dist` for the built packages after `pnpm build`, `--no-apps` to skip the example apps).
- Fixtures are the same small app three times (`fixtures/tanstack-query`, `raf-on-tanstack`, `raf-query`, sharing `fixtures/shared/api.ts`), written like the Start example: factories with `queryOptions`, loaders that prefetch, `useQuery` readers, actions that invalidate, and a TanStack Router app.
- They build with the Start example's bundler (Vite + `@vitejs/plugin-react` + React Compiler), with React and TanStack Router external. Each entry renders the app with `react-dom/client`. The script also builds both Start example apps and sums their client JS.
- The TanStack fixture uses TanStack's current API (`qc.query()` / `qc.infiniteQuery()`).
- "Effect's share" bundles once more with `effect` external.
- `src/analyze.ts` lists one raf-query fixture app's modules by size, largest first (`node src/analyze.ts [export] [module] [--top N]`, default `queryApp` from `apps.tsx`). Start there after `measure.ts` shows a change.
- Numbers, what defeats tree-shaking, and the rejected Promise-engine experiment (branch `cursor/promise-engine-reference-16c7`): [bundle-size.md](../bundle-size.md).
