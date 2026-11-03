# Agents

This repo is a **from-scratch rewrite** of tRPC (vNext / `v12` branch), not maintenance of current tRPC. All new work happens in [`next/`](./next/); read [`next/AGENTS.md`](./next/AGENTS.md) first.

Push commits straight to `v12`; don't open pull requests against it ([Landing on `v12`](./next/AGENTS.md#landing-on-v12)).

The repository root is one pnpm workspace: v11 (`v11/`, `@trpc/*`), v12 (`next/`, `@trpc12/*`), the site (`www/`) and `tooling/`, with one lockfile and one `turbo.json` ([`one-workspace.md`](./next/.agent-docs/decisions/one-workspace.md)). `pnpm install` anywhere installs all of it. Run the gates and `pnpm land` from `next/`. At the root, `pnpm build`, `typecheck`, `lint` and `test` run every package's through turbo, cached locally and in CI ([`task-cache.md`](./next/.agent-docs/decisions/task-cache.md)), and `pnpm check:www` checks the site and `tooling/`.

- Brief and constraints: `next/.agent-docs/decisions/brief.md`
- Design docs (proposals, decisions, notes): `next/.agent-docs/`
- Vendored dependency source (read-only reference): `next/.repos/`

[`www/`](./www/AGENTS.md) is trpc.io's site, `main`'s since #7771, serving every version's docs: v12's in `www/v12/docs/` are edited here, v11's, v10's, v9's and the blog on `main`.

[`v11/`](./v11/) is v11 (`packages/`, `examples/`), with the `v11-*` workflows, kept working and released until 12.0.0 ([`v11-stays-until-12.md`](./next/.agent-docs/decisions/v11-stays-until-12.md)). Don't add vNext code there ([`next/.agent-docs/decisions/v11-folder.md`](./next/.agent-docs/decisions/v11-folder.md)).

The root `examples/` holds only `vercel.json` stubs: they exist so the v11 Vercel projects, whose root directories are still those paths, skip every branch (`deploymentEnabled: false`), so PRs from branches off `v12` skip them too ([`v11-folder.md`](./next/.agent-docs/decisions/v11-folder.md)). The stubs only exist on `v12` and its branches; `main` keeps the real configs. They're removed at the cutover. Anything else under the root's `examples/` in a checkout is an ignored leftover from before the move to `v11/`; delete it.
