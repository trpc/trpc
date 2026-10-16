---
name: dependency-maintenance
description: Dependency maintenance. Use when adding, moving, or upgrading dependencies, changing pnpm or JavaScript runtimes, updating TypeScript or build/test tools, or changing native-build policy, patches, or test images.
---

Treat an upgrade as a synchronization task, not a lockfile refresh. Derive
versions, commands, and compatibility points from the current repository.

## Discover

1. Read affected manifests and scripts, `pnpm-workspace.yaml`, setup actions,
   workflows, test configuration, and compatibility documentation.
2. Search for the dependency and every current version, range, runtime input,
   image, engine constraint, patch, and compatibility claim.
3. Record each match as a development version, tested version, peer range,
   engine minimum, advertised minimum, or intentionally different constraint.
4. When adding or moving a manifest entry, read
   [manifest-roles.md](manifest-roles.md) before selecting its role.
5. Select the package-local or coordinated branch and its validation matrix.

Discovery is complete when every match and affected validation surface is
accounted for.

## Package-local branch

Use this branch only for one dependency in one workspace package when runtime,
compiler, package-manager, image, patch, native-build, and shared-tooling policy
are unchanged.

Update only the owning manifest and keep peer compatibility independent from
the development version tested here. If any coordinated surface appears,
switch branches.

This branch is complete when the manifest and lockfile agree, focused checks
pass, and every search result is intentionally unchanged or package-local.

## Coordinated branch

Read [coordinated-upgrades.md](coordinated-upgrades.md), select every applicable
row, and update all listed synchronization points before installing. Apply root
workflow and generated-file requirements before editing those surfaces, then
return here to finish matrix and lockfile review.

## Install and finish

Run root `pnpm install` after all selected edits. Inspect warnings and the
semantic lockfile diff for specifiers, resolutions, duplicate transitives, peer
changes, integrity, patch hashes, lifecycle scripts, and `allowBuilds` effects.
A successful install alone does not complete this review.

Run the narrowest correctness and performance checks that cover every selected
matrix row.
Apply the root changeset routing after implementation and focused validation.

The task is complete when repeated repository searches find no unclassified
synchronization point, manifest roles and compatibility ranges are intentional,
the lockfile has no unexplained churn, and every selected check passes or is
reported as not runnable.
