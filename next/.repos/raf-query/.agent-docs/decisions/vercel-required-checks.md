# Every deployed app's Vercel check is required on `main` (human asked)

- Human: deploy `examples/react-router` "with the same settings as the rest and make it enforced in CI".
- "Enforced" is the `main` ruleset (`gh api repos/KATT/raf-query/rulesets`): its required status checks list `Vercel – <project>` for every Vercel project next to the GitHub Actions jobs. A new deployed app adds its check there; a removed one takes it out, or every PR waits on a check that never reports.
- A deployment skipped by the ignore step ("Canceled by Ignored Build Step") or by "skip unaffected projects" reports success, so requiring the check doesn't block PRs that don't touch the app.
- "Same settings" is the other example projects' settings, copied from `GET /v9/projects/<name>`: GitHub `KATT/raf-query`, the app's directory as root, files outside it included, Node 24, Fluid in `iad1`, `ENABLE_EXPERIMENTAL_COREPACK=1` in every environment, "skip unaffected projects" on, no Vercel Authentication. Install, build and ignore commands live in the app's `vercel.json`.
- The `<app>.raf-query.katt.dev` domain is verified with a `_vercel` TXT record in the `katt.dev` zone, which is in the personal team (`alex-katts-projects`), not `trpc`. The Vercel MCP server only reaches the personal team; the `vercel` CLI login reaches `trpc`.
