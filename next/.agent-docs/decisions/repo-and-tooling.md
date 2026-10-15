# The hook skips typecheck; the v11 tree stays for now (human)

- Alex, 2026-10-15 (Q22.2): "No". The precommit hook (`vp staged`) formats, lints and runs related tests; it does not typecheck. Agents run `pnpm typecheck` before pushing, and CI covers it.
- Alex, 2026-10-15 (Q22.5): "Keep". The v11 tree at the repo root (`packages/`, `examples/`, `www/`) stays until parity. New code still goes only in `next/`.
- Alex, 2026-10-15 (Q21.5): "Later. We won't build the website yet so just keep docs somewhere you maintain for now". No generated API reference yet. User docs are hand-written Markdown in `next/docs/`, which agents update with each change.
- Lost: faster type feedback at commit time; a smaller repo.
- Lives in: `next/package.json`, `next/docs/`.
