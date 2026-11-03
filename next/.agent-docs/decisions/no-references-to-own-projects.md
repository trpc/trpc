# v12 doesn't credit or mention the human's own projects (human)

- Human, 2026-11-03: "you don't need references to [another project] btw anywhere in our docs or [another project]. that's my projects". Then, the same day: "you don't need to credit any of my projects in v12, but don't touch older versions' docs". So no v12 content names one of the human's own projects: the www v12 docs and build, these decision records, proposals, open questions and reference, spikes and code comments. Progressive JSON is described as progressive JSON, not by the library it was ported from.
- (agent) Quotes keep the human's words, with a project's name replaced by `[another project]` (or `[the]` where it was an adjective), so a quote stays verbatim apart from the bracket. git history keeps the originals.
- (agent) Out of scope, and kept:
  - The v9, v10 and v11 docs (`www/v9/`, `www/v10/`, `www/v11/`) and everything under `../v11/`, as the human said.
  - Tools the workspace runs, named because commands and config use them: `vendor-src` (`.repos/`, `postinstall`, `pnpm vendor:sync`) and the `devalue-async` dependency of `spikes/sse-deferred/`, whose tests compare against it.
  - The human's GitHub account where the site uses it: the sponsors sync reads its sponsorships ([`docs-sponsors.md`](./docs-sponsors.md)), and the blog and social-card tests use it as an author.
  - tRPC's own PRs and RFCs in [`../reference/prior-art.md`](../reference/prior-art.md), which are tRPC's history, not side projects.
  - The dated notes in `../notes/`, which record a spike as it ran, and permalinks into trpc/trpc's history whose paths still carry an old name.
- (agent) Credit to other people's projects stays: Result RPC for error boundaries ([`error-boundaries.md`](./error-boundaries.md)), Dan Abramov's Progressive JSON post ([`progressive-json.md`](./progressive-json.md)), trpc-openapi, Zodios, ts-rest and oRPC ([`docs-credits.md`](./docs-credits.md)), TanStack Query and dmmulroy/anti-slop.
- Why: they're the human's own projects, not prior art the docs need to cite.
- Lost: links to where a borrowed pattern came from; each record describes the pattern itself instead. The progressive JSON port's credit in its source, which the library's author asked to drop.
- Lives in: `.agent-docs/` (`decisions/`, `proposals/`, `open/`, `reference/`, `README.md`, `approach.md`), `www/v12/docs/`, `packages/trpc/src/transformer/`, `tooling/oxlint-plugin/anti-slop/AGENTS.md`, `spikes/package.json`.
