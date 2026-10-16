# Authoring changesets

Update the changeset already introduced by the PR. If there is none, create one
`.changeset/<descriptive-name>.md` for the complete PR:

```md
---
"effect": patch
"@effect/affected-package": patch
---

Describe the consumer-visible change and why it matters.
```

Default to one short paragraph of one to three sentences. State the changed
behavior or API and, for a break, the required migration. Leave motivation,
implementation details, benchmarks, test coverage, and the development history
in the PR description.

When several related consumer-visible effects cannot be stated clearly in that
paragraph, use compact bullets with one outcome per bullet. Keep them in this
file under the PR's shared purpose.

List every directly affected published package. Do not list packages merely
because they share the fixed release group in `.changeset/config.json`.

Choose the bump from current release policy:

- Use `patch` for compatible fixes, `minor` for compatible additions, and
  `major` for breaks.
- A break confined to APIs tagged `@stability unstable` is `minor`. A break
  confined to APIs tagged `@stability experimental` is `patch`. APIs without a
  stability tag follow strict semver.
- Use `major` only when a maintainer has approved a major release.
- The release queue retargets PRs with `minor` changesets to `v4/next-minor`
  and PRs with `major` changesets to `v4/next-major`. Choose the level the
  change requires, not the branch you want it to land on.
- Ask when release intent is ambiguous.

Write for consumers. Use a `### Breaking changes` section when several breaks
need separate scanning. Include before/after examples only when they materially
clarify migration.

Validate frontmatter against published package names and inspect nearby current
changesets for wording and release convention. Never run `changeset-version` or
`changeset-publish` as contributor validation.
