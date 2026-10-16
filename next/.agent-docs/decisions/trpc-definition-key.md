# `'~trpc'` replaces `_def` (human)

- Human, 2026-10-09 (Q3.4): "1y". Procedure and router definitions live under `'~trpc'`, with no `_def` alias: `appRouter.post.byId['~trpc'].type`.
- Why: it follows Standard Schema's `~standard`. `~` keys sort last, hide from most autocomplete lists and can't collide with user keys; router keys starting with `~` are reserved (08).
- Lost: v11 familiarity for code that reads `_def` (codegen, community tooling).
- Lives in: `packages/trpc/src/server/procedure.ts`, `router.ts`.
