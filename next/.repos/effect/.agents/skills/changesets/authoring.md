# Authoring changesets

Update the changeset already introduced by the PR. If there is none, create one
`.changeset/<descriptive-name>.md` for the complete PR:

```md
---
"effect": patch
"@effect/affected-package": patch
---

Fix `Effect.cachedInvalidateWithTTL` caching a stale result when invalidated while the effect is running.
```

Write one short sentence, usually under 25 words, that names the changed API
and states what consumers will notice. That sentence is the whole entry unless
the change is breaking or consumers must migrate.

Leave out how the change works: internal modules, algorithms, data structures,
refactors, motivation, benchmarks, test coverage, and development history. They
belong in the PR description. Cut any sentence a consumer would not act on.

- Bad: "Rework the `MemoMap` lookup so `Layer.provide` checks identity before
  building, adding a cache keyed by layer reference and tests for shared
  layers."
- Good: "Fix composed layers being rebuilt for every parent that references
  them."

Add detail only for a break or required migration: what existing code must
change and how. Use compact bullets, one break per bullet, when several breaks
need migration steps. Several non-breaking fixes or additions still share one
sentence.

List every directly affected published package. Do not list packages merely
because they share the fixed release group in `.changeset/config.json`.

Choose the bump from current release policy:

- Use `patch` for compatible fixes, `minor` for compatible additions, and
  `major` for breaks.
- A break confined to APIs tagged `@stability unstable` is `minor`. A break
  confined to APIs tagged `@stability experimental` is `patch`. APIs tagged
  `@stability stable` follow strict semver.
- Use `major` only when a maintainer has approved a major release.
- The release queue retargets PRs with `minor` changesets to `v4/next-minor`
  and PRs with `major` changesets to `v4/next-major`. Choose the level the
  change requires, not the branch you want it to land on.
- Ask when release intent is ambiguous.

Use a `### Breaking changes` section when several breaks need separate
scanning. Include before/after examples only when they materially clarify
migration.

Validate frontmatter against published package names and inspect nearby current
changesets for release convention. Do not copy the length of longer entries.
Never run `changeset-version` or `changeset-publish` as contributor validation.
