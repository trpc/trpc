# Publisher backends are Effect guides, not packages (human)

- Human, 2026-10-15 (issues review Q8, #5618): "Can we just use Effect OOB without shipping something here maybe?", then "It'd be nice to just use Effect and have the guides show how to use their things".
- No Redis, Postgres or Durable Object backends ship. `www/docs/subscriptions/backends.md` shows an `experimental_Publisher` layer built on Effect's own services: `effect/persistence/Redis` with `NodeRedis.layer` from `@effect/platform-node`, and `@effect/sql-pg` `LISTEN`/`NOTIFY`.
- Why: Effect already maintains the clients, pooling and reconnects, and a layer is a few lines.
- Lost: a tested, versioned backend per store; the guides' code is the app's to maintain.
- Lives in: `www/docs/subscriptions/backends.md` (with a Durable Object recipe too); the Redis recipe runs against a fake `Redis.make` client and the Postgres one is typechecked, in `test/integration/publisher-recipes.test.ts`.
