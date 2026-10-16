# Example navigations prefetch (human)

- Issue pages start the issue with `prefetch`, the same as the assignee and comments. Nothing on the route `await`s, so TanStack Start commits the navigation immediately and the new page paints its skeletons.
- The back / previous / next bar reads the id from the URL. The title, body, and status each suspend on the issue. Comments and the assignee keep their own skeletons. A missing issue is `null`; the page calls `notFound()` when it reads that.
- Previous and next stay on the same route, so the page remounts per id at the router level, not with keys on each suspense boundary. Both TanStack Start apps set `remountDeps: (opts) => opts.params` on the route; Next.js already remounts the page segment when its dynamic param changes. A remounted page shows its skeletons for the new issue instead of the old one's content.
- Next.js sends the same skeletons in the first response and streams the data after. It still spends a server round trip before that response.
- The Effect example keeps its typed `IssueNotFound`: the page reads the `Result` and throws `notFound()` for it. The error crosses SSR as itself through `keepErrors` and a serialization adapter ([effect-example.md](./effect-example.md)).
- Lost: `await qc.ensure(issueQuery)` blocking the route until the issue arrived, throwing `notFound()` from the query function, and the Effect example's `Effect.fn` loader with `catchTag("IssueNotFound")`.
- Files: `examples/tanstack-start/src/routes/issues/$issueId/route.tsx`, `examples/nextjs/src/app/issues/[issueId]/page.tsx`, `examples/nextjs/src/app/issues/[issueId]/_components/issue-page.tsx`, `examples/tanstack-start-effect/src/routes/issues/$issueId/route.tsx`, `examples/tanstack-start-effect/src/start.ts`.
