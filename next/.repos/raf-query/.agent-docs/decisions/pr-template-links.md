# PR descriptions link the docs page and the example (human asked)

- The pull request template has a Links table: the docs page, the Next.js example, the TanStack Start example, and the TanStack Start Effect example.
- Each cell is a deep link to that project's Vercel preview (exact page or route, with an anchor when one heading is the point). Base URLs come from the Vercel bot comment once Ready. Leave "pending" until then. Delete a row the change does not touch. Write "None" when it shows up in neither the docs nor the examples.
- Why: most changes show up on a docs page or in the example apps, and a reviewer should open that page.
- Lost: preview URLs buried in Testing, or a link to the site root.
- Lives in `.github/PULL_REQUEST_TEMPLATE.md`. How to copy a preview URL stays in `AGENTS.md` ("Verifying changes"). Project names: `raf-query`, `raf-query-nextjs`, `raf-query-tanstack-start`, `raf-query-react-router`, `raf-query-tanstack-start-effect`.
