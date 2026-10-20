# Agents

This repo is a **from-scratch rewrite** of tRPC (vNext / `v12` branch), not maintenance of current tRPC. All new work happens in [`next/`](./next/); read [`next/AGENTS.md`](./next/AGENTS.md) first.

Push commits straight to `v12`; don't open pull requests against it ([Landing on `v12`](./next/AGENTS.md#landing-on-v12)).

Run `pnpm install`, the gates and `pnpm land` from `next/`, its own workspace. A `pnpm install` at the root installs v11's workspace, and its `node_modules/` lets code in `next/` import packages its `package.json` doesn't list, which CI's install doesn't have.

Name every branch cut from `v12` `v12-<name>`: only those get `trpc-v12` preview deployments ([`docs-website-on-vercel.md`](./next/.agent-docs/decisions/docs-website-on-vercel.md)).

- Brief and constraints: `next/.agent-docs/decisions/brief.md`
- Design docs (proposals, decisions, notes): `next/.agent-docs/`
- Vendored dependency source (read-only reference): `next/.repos/`

[`v11/`](./v11/) is the v11 monorepo (`packages/`, `examples/`, `www/`), with its own pnpm workspace and the `v11-*` workflows. Don't add vNext code there ([`next/.agent-docs/decisions/v11-folder.md`](./next/.agent-docs/decisions/v11-folder.md)).

The root `www/` and `examples/` hold only `vercel.json` stubs: they exist so the v11 Vercel projects, whose root directories are still those paths, skip every branch (`deploymentEnabled: false`), so PRs from branches off `v12` skip them too ([`v11-folder.md`](./next/.agent-docs/decisions/v11-folder.md)). The stubs only exist on `v12` and its branches; `main` keeps the real configs. They're removed at the cutover. Anything else under the root's `www/` or `examples/` in a checkout is an ignored leftover from before the move to `v11/`; delete it.
