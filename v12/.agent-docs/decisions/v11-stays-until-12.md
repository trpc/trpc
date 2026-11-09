# v11 stays, working and released, until 12.0.0 (human)

- Human, 2026-11-01 (via the coordinator): "we will _eventually_ delete the v11 stuff, but that's not until 12.0.0"
- `v11/` (`@trpc/*`'s packages, examples, tests and tooling) stays in the workspace with its CI (`v11-ci.yml`, `v11-lint.yml`), its release path and its docs on the site until 12.0.0 is published. Changes to the workspace keep v11's build, typecheck, tests and lint passing, as `main` runs them.
- (agent) What goes at 12.0.0: `v11/`, its `v11-*.yml` workflows and their triggers, the `pnpm-workspace.yaml` entries and `turbo.json` tasks that name v11's packages (`root`, `examples-minimal-*`), the root `vercel.json` stubs and `www/api-reference`'s v11 entry points, if v11's API reference is gone by then. Not v11's docs at `/docs`: what the site serves for v11 after 12.0.0 is [`trpc-io-cutover-and-hidden-v12.md`](./trpc-io-cutover-and-hidden-v12.md)'s question.
- Why: v11 is what users run until 12.0.0, and fixes to it still have to be released.
- Lost: until then, every workspace change pays for v11's checks too, and its dependencies resolve with v12's ([`one-workspace.md`](./one-workspace.md)).
- Lives in: `v11/`, `.github/workflows/v11-*.yml`, `pnpm-workspace.yaml`, `turbo.json`.
