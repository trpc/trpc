# 21 — Stability tiers, JSDoc and deprecation

| Status     | Area      | Depends on | oRPC parity rows |
| ---------- | --------- | ---------- | ---------------- |
| `proposed` | all, docs | 01         | —                |

## Summary

The [brief](../decisions/brief.md) asks for two things:

- "JSDoc on every public function."
- "Mark unstable internals more clearly than today."

**Recommendation:**

- Mark stability in JSDoc (`@stability`, `@since`), following Effect's convention, and use experimental _entry points_ instead of name prefixes.
- A `./internal` entry point with no semver guarantees.
- A CI check that every public export has JSDoc with the required tags.

## Today (v11)

- Name prefixes: `experimental_caller`, `unstable_concat`, `unstable_localLink`, `experimental_standaloneMiddleware`, … Stabilising an API means renaming it, which breaks users and leaves deprecated aliases behind.
- `@trpc/server/unstable-core-do-not-import` is imported by every official package. Its name says "do not import", but users still reach for it to name types (TS2742; see 01).
- JSDoc coverage is partial. A website hosts the docs.

## Effect's convention (`effect@4.0.2`)

```ts
/**
 * Creates a handler for a router.
 *
 * @example
 * const handler = createHandler({ router })
 *
 * @since 4.0.0
 * @category constructors
 * @stability unstable
 */
```

`@stability unstable` means breaking changes can land in minors. `experimental` means breaking changes can land in patches. No name prefixes (`MIGRATION.md`).

## Options

- **ST-A — JSDoc tags only** (Effect). Stable names; stability is visible in hovers and in generated docs.

  ```ts
  // ST-A: stable name and entry point; the tier is only in the JSDoc
  /**
   * In-process link with serialization, for tests and SSR.
   *
   * @since 12.0.0
   * @stability experimental
   */
  export function localLink(opts: LocalLinkOptions): TRPCLink { … }

  import { localLink } from '@trpc12/trpc/client';
  ```

- **ST-B — Name prefixes** (v11).

  ```ts
  // ST-B: the tier is in the name, so stabilising it is a rename (`@since` value pending Q21.2)
  /**
   * In-process link with serialization, for tests and SSR.
   *
   * @since 12.0.0
   */
  export function unstable_localLink(opts: LocalLinkOptions): TRPCLink { … }

  import { unstable_localLink } from '@trpc12/trpc/client';
  ```

- **ST-C — Entry-point tiers.** Experimental APIs only live under `…/experimental` (for example `@trpc12/trpc/server/experimental`), so the import path shows the tier.

  ```ts
  // ST-C: src/client/experimental.ts, the only place localLink is exported from
  /**
   * In-process link with serialization, for tests and SSR.
   *
   * @since 12.0.0
   */
  export function localLink(opts: LocalLinkOptions): TRPCLink { … }

  import { localLink } from '@trpc12/trpc/client/experimental';
  ```

- **ST-A + ST-C:** both. The entry point gives a coarse signal, the JSDoc gives precision.

  ```ts
  // ST-A + ST-C: same entry point as ST-C, plus the tag
  /**
   * In-process link with serialization, for tests and SSR.
   *
   * @example
   * createTRPCClient<AppRouter>({ links: [localLink({ router: appRouter, createContext })] })
   *
   * @since 12.0.0
   * @stability experimental
   */
  export function localLink(opts: LocalLinkOptions): TRPCLink { … }
  ```

## Proposed rules

1. Every export from a public entry point has JSDoc with a summary, at least one `@example` for functions, `@since` and `@stability` (`stable` | `unstable` | `experimental`).
2. **No `unstable_` / `experimental_` name prefixes.** Experimental APIs live in `/experimental` entry points. Graduating an API moves its export, while the old path keeps re-exporting it with `@deprecated` for one minor version.

   ```ts
   // @trpc12/trpc/client/experimental, for one minor after localLink graduates to @trpc12/trpc/client
   /** @deprecated Import `localLink` from `@trpc12/trpc/client`. */
   export { localLink } from './links/localLink.ts';
   ```

3. `./internal` is the glue for first-party packages. It has no semver guarantees, its JSDoc header says so, and every export is tagged `@internal` (not stripped, because types must stay nameable; see 01).

   ```ts
   // src/internal/index.ts
   /**
    * Internal glue (`@trpc12/trpc/internal`) for first-party `@trpc12/*` packages. No semver guarantees.
    *
    * @internal
    */

   /** @internal */
   export type { AnyProcedure } from '../server/procedure.ts';
   ```

4. Deprecations carry `@deprecated <replacement>` and are removed in the next major. **vNext starts with zero deprecated aliases.**
5. A CI script (TypeScript compiler API, no extra dependencies) fails if a public export is missing JSDoc or the required tags, or if a stable entry point re-exports something tagged experimental.
6. API reference Markdown can be generated from the JSDoc into `docs/reference/` (**open**).

## Recommendation

**ST-A + ST-C** with the rules above. `@since` starts at the first vNext version (Q21.2).

## Questions

- **Q21.1** Stability via JSDoc tags + experimental entry points, and no name prefixes?
- **Q21.2** Version label for `@since`: `12.0.0`, or something else (is vNext "v12")?
- **Q21.3** A `./internal` entry point with no semver guarantees for first-party packages?
- **Q21.4** Enforce JSDoc rules with a CI script?
- **Q21.5** Generate API reference Markdown from JSDoc?

## Decision

- **Q21.1:** [ ] yes · [ ] prefixes · [ ] other
- **Q21.2:** `@since` = the v12 prerelease version (not `12.0.0`) → [since-prerelease](../decisions/since-prerelease.md)
- **Q21.3:** [x] yes, only for portability types; extensions use `@trpc12/trpc/extend` · [ ] no → [entry-points](../decisions/entry-points.md)
- **Q21.4:** [x] yes (oxlint plugin) · [ ] no → [acronym-casing](../decisions/acronym-casing.md)
- **Q21.5:** [ ] yes · [ ] no · [x] later; hand-written docs in `next/docs/` for now → [repo-and-tooling](../decisions/repo-and-tooling.md)
- **Notes:**
