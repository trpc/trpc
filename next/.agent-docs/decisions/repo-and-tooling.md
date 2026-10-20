# The hook skips typecheck; the v11 tree stays for now (human)

- Human, 2026-10-15 (Q22.2): "No". The precommit hook (`vp staged`) formats, lints and runs related tests; it does not typecheck. Agents run `pnpm typecheck` before pushing, and CI covers it.
- Human, 2026-10-15 (Q22.5): "Keep". The v11 tree (`packages/`, `examples/`, `www/`, in `v11/` since 2026-10-19, see [`v11-folder.md`](./v11-folder.md)) stays until parity. New code still goes only in `next/`.
- Human, 2026-10-15 (Q21.5): "Later. We won't build the website yet so just keep docs somewhere you maintain for now". No generated API reference yet. User docs are hand-written Markdown, which agents update with each change. The website part is superseded: the docs now render as a site in `next/www/` ([`docs-website.md`](./docs-website.md)), from `next/www/docs/` ([`docs-in-www.md`](./docs-in-www.md)).
- Lost: faster type feedback at commit time; a smaller repo.
- Lives in: `next/package.json`, `next/www/docs/`.
