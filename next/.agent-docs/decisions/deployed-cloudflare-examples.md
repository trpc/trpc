# The Cloudflare example is deployed to Cloudflare and smoke-tested there (human asked)

- Human, 2026-10-16 (decision round, landing durable mid-stream resume): "we gotta make some real cloudflare examples that are actually deployed on cf too in order to get confidence".
- (agent) `examples/cloudflare/` covers what @trpc12/trpc ships for Cloudflare: a Worker routing to a Durable Object per room, hibernating WebSockets with `hibernatingPublisher`, and a durable streamed mutation (`digest`) whose results and frames live in the object's storage (`src/storage.ts`: Effect's `KeyValueStore` on `DurableObjectStorage`, under `Persistence.layerBackingKvs`).
- (agent) One smoke script for both targets. `pnpm smoke` runs the Worker on workerd through Wrangler; with `SMOKE_URL` it calls a deployed Worker instead, in a fresh room per run. It checks an HTTP query, a subscription over a hibernating socket, and a durable call whose first response drops after two frames and resumes with `trpc-resume-from: 2`.
- (agent) `.github/workflows/next.yml` job `cloudflare-deploy`: on pushes to `v12`, after `check`, `pnpm run deploy` (`wrangler deploy`) and then the smoke against the `workers.dev` URL that the deploy prints. Every step is skipped while the secrets are missing.
- Open: credentials. The repo needs the `CLOUDFLARE_API_TOKEN` (Workers Scripts edit, Durable Objects) and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets for CI, and Cloud Agents need them under Cursor Dashboard > Cloud Agents > Secrets to deploy by hand. Nothing has been deployed yet.
- Open: more deployed examples (a stateless Worker with `createFetchHandler` and KV, Workers RPC) once the first deploy runs.
- Why: workerd under Wrangler is close to production, but Durable Object placement, hibernation and streaming through Cloudflare's edge only show up when deployed.
- Lost: CI runs that never touch the network for this job; a Worker per push on the human's account (one name, `trpc-cloudflare-example`, redeployed in place).
- Lives in: `next/examples/cloudflare/` (`smoke.ts`, `src/storage.ts`, `package.json` `deploy`), `.github/workflows/next.yml` (`cloudflare-deploy`).
