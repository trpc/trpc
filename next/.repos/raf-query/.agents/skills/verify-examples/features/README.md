# Example apps feature map

Behavior-level inventory of the example issue tracker, from a user's point of view. The four apps (`tanstack-start`, `nextjs`, `tanstack-start-effect`, `react-router`) show the same screens with the same accessible names, so every recipe runs unchanged against each, with `$U` set to the app's origin. Where an app differs, the feature's `Gotchas` says so and why.

## Baseline preconditions

- The app is running from this checkout and `$CE doctor --app <app>` is `ok` (see [`../SKILL.md`](../SKILL.md)).
- `CE="node .agents/skills/verify-examples/scripts/control-examples.mjs"` and `U=http://localhost:<port>` (3000, 3001, 3005, 3006).
- Seed data: 42 issues, `#1` (oldest, Jan 7) to `#42` (newest), each Open, In progress or Closed, with 0-10 comments and an assignee. Ten issues per page, four comments per page. Data lives in the server process: a restart reseeds, and each app has its own copy.
- Settings cookies are at their defaults (Prefetch links Off, Stale time 5 s, Latency 400 ms). `Reset` restores them.
- The devtools panel is closed (`localStorage["raf-query-devtools:open"]` unset). It stays open across reloads once opened.

## Driving conventions

- Recipes open `$U/issues…`, which redirects to the same page under `/prefetch/` (see [loader verb](loader-verb.md)). Paths read back from the page (`location.pathname`, link targets) carry the verb.
- Find elements by role and accessible name (`$CE snapshot`), never by CSS class or position.
- Wait for text with `$CE wait`, not fixed sleeps. The server adds about 400 ms ± 50% per API call by default; set Latency to None for fast runs, or 3 s to watch pending states.
- `$CE open` the same URL twice after starting a dev server: Vite and Next.js compile on first visit and may reload the page once.
- Writes go to the server's in-memory DB. Put back what you changed (title, description, status) at the end of a recipe. Comments can't be deleted; post them on an issue nobody else asserts on, or restart the server.
- Read writes back without the page's cache: `curl -s $U/api/issues/<id>` (REST apps) or a fresh `$CE open` (all apps).

## Proof and skip reporting

- Record the action and the observable end state: command output, `$CE snapshot`, a screenshot when the look matters.
- A write is proven by a second read: the API, or a reload.
- A change to `examples/.shared/` or `packages/` is proven in all four apps. Name the apps you ran; one app passing doesn't prove the others.
- If a path can't be reached (for example Next.js link prefetch in dev), say which and why, and cover the closest real path (a production build).

## Feature entry contract

Each feature file starts with an H1 and a paragraph on what the user sees, then four H2s in this order: `Sub-features` (short IDs, one line each), `How to get to it (user POV)`, `Driving it with control-examples` (`Preconditions:` then labelled bullets pairing an action, the exact command, and the observable result), and `Gotchas`. Keep implementation details out: user paths, accessible names, URLs, commands, and what proves it.

## Full sweep

Walk the list top to bottom for a broad regression, then finish with [cross-app journeys](cross-app-journeys.md).

- [Server rendering](server-rendering.md): data in the first HTML, streamed sections, hydration without refetching.
- [Issue list](issue-list.md): counts, status filter, sort, infinite scroll, row links, empty filter.
- [Issue detail](issue-detail.md): issue page, previous/next, skeletons, assignee card.
- [Status changes](status-changes.md): the status menu in list rows and on the issue page, optimistic.
- [Inline editing](inline-editing.md): edit the title and description in place, cancel, validation.
- [Comments](comments.md): paged comments, posting with an optimistic row.
- [Settings bar](settings-bar.md): loader verb, link prefetch, stale time, latency, Reset.
- [Loader verb](loader-verb.md): `prefetch`, `ensure` or `fetch` from the URL and the header's `Loader` select, and what each waits for.
- [Navigation progress bar](navigation-progress.md): the bar along the top while a navigation waits.
- [Devtools](devtools.md): the raf-query devtools panel.
- [Not found](not-found.md): unknown URLs and missing issues.
- [Demo write warning](demo-write-toast.md): the toast deployed demos show on writes.
- [Theme](theme.md): light and dark follow the system.
- [Cross-app journeys](cross-app-journeys.md): one journey through all four apps, and where they differ.
