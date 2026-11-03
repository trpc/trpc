# The docs don't mention the human's own side projects (human)

- Human, 2026-11-03: "you don't need references to [another project] btw anywhere in our docs or [another project]. that's my projects". The project names are out of the www docs, these decision records, proposals, open questions, spikes and code comments.
- (agent) Quotes keep the human's words, with a project's name replaced by `[another project]` (or `[the]` where it was an adjective), so a quote stays verbatim apart from the bracket. git history keeps the originals.
- (agent) Credit to outside projects stays: Result RPC for error boundaries ([`error-boundaries.md`](./error-boundaries.md)), danSON for progressive JSON ([`progressive-json.md`](./progressive-json.md)), oRPC, TanStack Query and dmmulroy/anti-slop.
- Why: they're the human's personal projects, not prior art the docs need to cite.
- Lost: links to where a borrowed pattern came from; each record describes the pattern itself instead.
- Lives in: `.agent-docs/decisions/`, `.agent-docs/proposals/`, `.agent-docs/open/`, `www/v12/docs/`, `tooling/oxlint-plugin/anti-slop/AGENTS.md`.
