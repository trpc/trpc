# Keep `t`; standalone plugin packages work through `.concat()` (human)

- Alex, 2026-10-10 (Q3.5): "let's keep `t`, but we need to make sure that we can still make some sort of plugins of standalone packages... what we now have in `.concat()` where a plugin can have a requirement of a specific thing or add it etc".
- Requirement: a package publishes a builder fragment from its own `initTRPC<{ ctx; meta }>()`, which is its requirement, and the app composes it with `authed.concat(plugin)`: requirements are checked against the current ctx (errors name the missing key), contributions flow on, and the published `.d.ts` is readable ([notes/concat-plugins.md](../notes/concat-plugins.md)). This must keep working as the builder grows; `.concat()` merges declared errors and services with the same checks.
- Why: `t` keeps the root types in one place and is what v11 users know. Top-level imports would need oRPC's bottom-up context model.
- Rejected: top-level imports only, or both forms.
- Open: whether a middleware that needs missing ctx is a type error (today, v11) or a requirement passed to callers (oRPC).
- Lives in: `packages/trpcdev/src/server/builder.ts`; `test/portability` publishes a plugin builder.
