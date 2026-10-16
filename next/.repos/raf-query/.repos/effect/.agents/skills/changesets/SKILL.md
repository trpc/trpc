---
name: changesets
description: Concise PR finalization changesets. Use when implementation scope is complete and focused validation has finished to classify release impact, consolidate the PR's existing changeset, or write its consumer release note.
---

Treat a changeset as the release note for the complete PR, not as a log of work
performed along the way. Finalize it after the current implementation scope and
focused validation are complete.

## Workflow

1. Inspect the complete diff from the merge base, including changeset files
   already introduced by the PR, and identify directly affected published
   packages.
2. Classify impact across source types, runtime behavior, entrypoints, required
   services, lifecycle, and persisted or wire data.
3. Perform the breaking audit below.
4. Record a reason no changeset is required, or update the PR's existing
   changeset. Create one only when the PR does not have one. When required, read
   [authoring.md](authoring.md).
5. Validate package names, frontmatter, bump policy, and a concise
   consumer-facing description.

Do not include unrelated worktree changes.

## PR-level consolidation

The default is one changeset file per PR. One file can name several packages and
summarize several related fixes or additions. Successive prompts, commits, and
subtasks within the same PR update that file. If implementation resumes after a
changeset was drafted, revise it during the next finalization pass.

Use separate files only when a maintainer requests the split or the PR contains
independent changes that need separate release notes.

## Requirement

Create a changeset for observable runtime behavior changes, including bug
fixes; exported value or public type changes; entrypoint or export-map changes;
changes to required services, errors, ownership, defaults, or lifecycle; and
persisted, serialization, protocol, or wire-format changes.

Tests-only changes, behavior-preserving internal refactors, documentation or
JSDoc maintenance, and unpublished tooling normally do not need one. When
unclear, inspect exports and consumer-visible declarations rather than inferring
from source location.

## Breaking Audit

A change is breaking when valid existing consumer code, configuration, or data
must change to keep compiling or behaving according to the previous contract.
Audit every surface:

- **Names and locations:** exports, entrypoints, compatibility exports, and
  module paths.
- **Call compatibility:** parameters, accepted inputs, overload resolution,
  generic parameters, and defaults.
- **Result compatibility:** return and error types, output narrowing, members,
  inference, and required services.
- **Runtime contracts:** defaults, failures, interruption, concurrency,
  ordering, resource lifetime, acquisition, cleanup, and mutation.
- **Data compatibility:** persisted schemas, encodings, database layouts,
  protocols, and wire formats.

Additive exports, optional parameters, and behavior-preserving implementations
are normally non-breaking. A fix restoring the documented contract is normally
non-breaking but still needs a changeset when its operational impact is
consumer-visible. Verify representative existing calls when overload ordering,
structural assignability, or inference makes compatibility uncertain. API diff
output is mechanical evidence, not a semantic-version decision.

The task is complete when every affected contract and published package is
accounted for and either the no-changeset decision is explicit or the PR has one
consolidated, valid changeset by default. Its release note describes the consumer
impact and migration for every break without repeating the PR description.
