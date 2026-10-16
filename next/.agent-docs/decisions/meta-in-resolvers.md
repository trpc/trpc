# Resolvers receive `meta` (human)

- Human, 2026-10-09 (Q4.5): "yes". `meta` is in the resolver options, not only in middleware: `t.procedure.meta({ auth: true }).query(({ meta }) => meta.auth)`.
- Why: resolvers read the same metadata middleware sees (a cache tag, a feature flag) without a pass-through middleware.
- Lost: nothing; v11's middleware-only `meta` forced a middleware to copy it into `ctx`.
- Lives in: `packages/trpcdev/src/server/execute.ts`.
