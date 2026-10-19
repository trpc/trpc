# Agents

This repo is a **from-scratch rewrite** of tRPC (vNext / `v12` branch), not maintenance of current tRPC. All new work happens in [`next/`](./next/); read [`next/AGENTS.md`](./next/AGENTS.md) first.

- Brief and constraints: `next/ideas.md`
- Design docs (proposals, decisions, notes): `next/.agent-docs/`
- Vendored dependency source (read-only reference): `next/.repos/`

[`v11/`](./v11/) is the v11 monorepo (`packages/`, `examples/`, `www/`), with its own pnpm workspace and the `v11-*` workflows. Don't add vNext code there ([`next/.agent-docs/decisions/v11-folder.md`](./next/.agent-docs/decisions/v11-folder.md)).
