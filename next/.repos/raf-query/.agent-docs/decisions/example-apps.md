# Example apps (human decided)

- `examples/tanstack-start` and `examples/nextjs` build **the same small, representative app**, so the two integrations can be compared side by side.
- `examples/tanstack-start-effect` is that app a third time, written with Effect and Effect RPC ([effect-example.md](./effect-example.md)).
- UI is shadcn on Base UI. The components live in one shared private workspace package, **`examples/.shared/ui`** (`@examples/ui`), kept **vanilla** (reinstall to bump; see [shadcn-base-ui.md](./shadcn-base-ui.md)). Apps contain only routes, query factories, and app-specific components.
- App-only shared UI helpers (logo, load-more, mock-db toast, theme provider) and the markup the apps share live in **`examples/.shared/kit`** (`@examples/kit`); data code stays in each app ([examples-kit-presentational.md](./examples-kit-presentational.md)).
- `examples/.shared/ui` layout: shadcn components in `src/components/*.tsx`, `src/lib/utils.ts` (`export { cn } from "cn"`), `src/hooks/*`, Tailwind v4 `src/styles/globals.css` (no tailwind config). `package.json` `exports`: `./globals.css`, `./components/*`, `./lib/*`, `./hooks/*`. Its `components.json` aliases point at `@examples/ui/...`, so `shadcn add` run there lands in the shared package.
- **The apps' shared packages live in `examples/.shared/`** (human): `api`, `db`, `ui`, and `kit`, so `examples/` lists only shipping apps. Experimental apps live under `.experimental/<topic>/` (e.g. `tanstack-query/start`, `react-router/app`). Like those, `.shared/` is listed separately in `pnpm-workspace.yaml`, the root `typecheck` filter, and the oxlint overrides, because `examples/*` globs don't reach it. Package names stay `@examples/<dir>` (experimental apps use `@examples/experimental-*`).
- Each app's `components.json` sets `ui` → `@examples/ui/components` and `utils` → `@examples/ui/lib/utils`, and `tailwind.css` → the shared `globals.css` (`style: base-nova`).
- Set `rsc: true` in `examples/.shared/ui/components.json` so interactive components get `"use client"`; Next server components import from the shared package, and TanStack Start ignores the directive.

App scope, small enough to read in one sitting, covering every documented feature:

| Screen / action                               | Exercises                                                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Issue list with status filter and sort in URL | search params → loader → paged `prefetch`, infinite scroll, `whilePending: "previous"`, `isPrevious` dimming |
| Issue detail                                  | `prefetch` + skeletons. The route opens at once; title, body, and status suspend                             |
| Comments under an issue                       | paged `useQuery`, streamed `prefetch`, infinite scroll                                                       |
| Assignee card                                 | Loader / server component: `prefetch` the issue's assignee beside the issue                                  |
| Inline edit title/body; change status in list | form Actions / transitions + `useOptimistic` + `await qc.invalidate`                                         |

App: **issue tracker** (confirmed). Data: an in-memory fake DB with artificial latency, shared by both apps so their behavior matches. **`queryFn`s call the shared REST API** (`@examples/api`, human asked; see `examples-rest-api.md`), not server functions.

- **No `useWaterfall` in the examples** (human): it's an escape hatch the examples shouldn't encourage. A query whose input comes from another query's result starts in the loader or server component once that result is in.
