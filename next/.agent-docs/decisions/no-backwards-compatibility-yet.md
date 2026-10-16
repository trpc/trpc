# No backwards compatibility while v12 is in development; migrations get tooling (human)

- Human, 2026-10-15 (decisions round 3, Q3): "I don't care about backwards compatability for now, we'll provide codemods, migration guides, and special interop request handlers for old clients so you can deploy without risking to break the old apps".
- Wire formats, APIs and protocol versions may change freely before release; no shims or negotiation for older vNext builds.
- Moving from v11 is a tooling job: codemods, migration guides, and interop request handlers that serve old (v11) clients from a v12 router, so servers can deploy before every client updates.
- Why: designing for compatibility now would freeze choices before they're right.
- Lost: nothing for users yet; prerelease adopters may need to update both ends together.
- (agent) Interop handler: `createV11Handler` serves every v11 link from a v12 router ([`v11-interop-handler.md`](./v11-interop-handler.md)); the migration guide is `docs/migrating-from-v11.md`.
- (agent) Codemod: `@trpcdev/upgrade`'s `trpcdev-upgrade` bin ([`v11-codemod.md`](./v11-codemod.md)).
- Lives in: `packages/trpcdev/src/interop/`, `packages/upgrade/`, `docs/migrating-from-v11.md`.
