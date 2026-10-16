# Migrating from Effect v3 to Effect v4

> **Note:** If you run into a migration issue this guide doesn't cover, let us
> know on [Discord](https://discord.gg/effect-ts) or open an
> [issue](https://github.com/Effect-TS/effect/issues).

## Background

Effect v4 is a major release with structural and organizational changes across
the ecosystem. The core programming model — `Effect`, `Layer`, `Schema`,
`Stream`, etc. — remains the same, but how packages are organized, versioned,
and imported has changed significantly.

### Versioning

All Effect ecosystem packages now share a **single version number** and are
released together. In v3, packages were versioned independently (e.g.
`effect@3.x`, `@effect/platform@0.x`, `@effect/sql@0.x`), making compatibility
between packages difficult to track. In v4, if you use `effect@4.0.0`,
the matching SQL package is `@effect/sql-pg@4.0.0`.

### Package Consolidation

Many previously separate packages have been merged into the core `effect`
package. Functionality from `@effect/platform`, `@effect/rpc`,
`@effect/cluster`, and others now lives directly in `effect`.

Packages that remain separate are platform-specific, provider-specific, or
technology-specific:

- `@effect/platform-*` — platform packages
- `@effect/sql-*` — SQL driver packages
- `@effect/ai-*` — AI provider packages
- `@effect/opentelemetry` — OpenTelemetry integration
- `@effect/atom-*` — framework-specific atom bindings
- `@effect/vitest` — Vitest testing utilities

These packages must be bumped to matching v4 versions alongside `effect`.

### Unstable Module System

v4 includes **unstable modules** under `effect/*` import paths. Their paths no
longer contain an `unstable` segment, but their API documentation is marked
with `@stability unstable`.

`@stability unstable` means an API may receive breaking changes in minor
releases. `@stability experimental` means it may receive breaking changes
across patch versions. APIs without a stability tag follow strict semver.

APIs that expose a third-party dependency are also marked `@stability
unstable`, because that dependency's own releases can change them. This covers
accessors to underlying clients (for example `NodeRedis`'s `client` and `use`),
options typed as the dependency's options, and re-exports such as
`@effect/platform-node/Undici`. It includes the generated provider schemas in
the `@effect/ai-*` packages and the `@effect/opentelemetry` integration.

Imports using `effect/unstable/<module>` must drop the `unstable` segment.
For example, replace `effect/unstable/http` with `effect/http` and
`effect/unstable/ai/LanguageModel` with `effect/ai/LanguageModel`. There
are no compatibility exports for the old paths.

Unstable modules include: `ai`, `cli`, `cluster`, `devtools`, `eventlog`,
`http`, `http-api`, `jsonschema`, `observability`, `persistence`, `process`,
`reactivity`, `rpc`, `schema`, `socket`, `sql`, `workflow`, `workers`.

Moving these modules does not stabilize their APIs.

### Performance and Bundle Size

The fiber runtime has been rewritten for reduced memory overhead and faster
execution. The core `effect` package supports aggressive tree-shaking — a
minimal Effect program bundles to ~6.3 KB (minified + gzipped). With Schema,
~15 KB.

---

## Migration Guides

### Import and API Rename Maps

- [v3 to v4 Import and API Rename Maps](./migration/v3-to-v4.md)

### Core

- [Services: `Context.Tag` → `Context.Service`](./migration/services.md)
- [Cause: Flattened Structure](./migration/cause.md)
- [Error Handling: `catch*` Renamings](./migration/error-handling.md)
- [Forking: Renamed Combinators and New Options](./migration/forking.md)
- [Effect Subtyping Changes](./migration/yieldable.md)
- [Fiber Keep-Alive: Automatic Process Lifetime Management](./migration/fiber-keep-alive.md)
- [Layer Memoization Across `Effect.provide` Calls](./migration/layer-memoization.md)
- [FiberRef: `FiberRef` → `Context.Reference`](./migration/fiberref.md)
- [Runtime: `Runtime<R>` Removed](./migration/runtime.md)
- [Scope](./migration/scope.md)
- [Equality](./migration/equality.md)

### Modules

- [Schema v4 Migration Guide](./migration/schema.md)
