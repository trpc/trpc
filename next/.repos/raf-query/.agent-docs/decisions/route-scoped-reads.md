# Components that read a route's queries live in the route's folder (human)

- Human: "those useQuery() things and their components should be scoped under the route themselves like in the folder for the route", the way the docs samples do it (TanStack Start samples define them in the route file; Next.js in `app/(blog)/components/`).
- **Why**: the route decides how a query starts (`prefetch`, `ensure`, `fetch`), and that decides what its handle is and what `useQuery` returns for it. The component that reads the handle belongs with the loader that made it.
- **What moves**: every component that calls `useQuery` on a handle from its route's loader. Components that only write (`edit-title`, `edit-body`, `status-select`) or are shared app chrome (`settings`, `app-link`) stay in `src/components` / `app/components`. `comments` reads and writes; it moves, since only the issue page uses it.
- **Folder per framework**, each its own way to keep the folder out of routing:
  - TanStack Start (both apps): `src/routes/<verb>/issues/index.tsx`, `src/routes/<verb>/issues/$issueId/route.tsx`, with `-components/` beside each (the router generator skips `-` prefixed files).
  - Next.js: `src/app/<verb>/issues/_components/`, `src/app/<verb>/issues/[issueId]/_components/` (`_` is the App Router's private folder).
  - React Router: `app/routes/<verb>/issues/route.tsx`, `app/routes/<verb>/issues/$issueId/route.tsx`, with `components/` beside each (`routes.ts` names the route files, so nothing else is a route).
- Each verb folder (`prefetch`, `ensure`, `fetch`) has its own copy of the readers (see `loader-verb-url.md`).
- Lost: one flat `components/` per app (couldn't tell which route's handles a component expects), and defining the readers inside the route file like the samples (the issue route would pass 300 lines).
