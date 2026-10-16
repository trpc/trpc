# `/internal` is for portability types; extensions use `trpcdev/extend` (human)

- Human, 2026-10-15 (Q21.3): "Only keep internal for things we don't want people to use to build integrations on but are needed for typescript to don't do those doomed errors". `trpcdev/internal` holds only the types TypeScript needs to name inferred types (TS2742, TS2883). No semver guarantees.
- Human, 2026-10-15: "can be a public api … can be one built for extensions of trpc", then "A". `trpcdev/extend` is the public, versioned entry point for integration authors: `createUntypedClient`, running links, calling procedures, the wire helpers and JSON Schema conversion.
- Human, 2026-10-15 (Q6.5): "Ok keep them, at their own export so they're isolated", then "keep them in middleware instead". The lifecycle helpers (`onStart`, `onSuccess`, `onError`, `onFinish`) are in `trpcdev/middleware`, which is where future built-in middleware goes. oRPC exports its equivalents from `@orpc/server`.
- Human, 2026-10-15: `trpcdev/actions` holds the `createAction`/`createCallable` factories ([`actions-and-rsc.md`](./actions-and-rsc.md)).
- Why: integrations build on a stable surface, and the main entry points stay focused on what apps use.
- Lost: one `/internal` grab bag for integration glue.
- Lives in: `packages/trpcdev/package.json` `exports`, `src/extend/`, `src/middleware/`, `src/actions/`, `src/internal/`.
