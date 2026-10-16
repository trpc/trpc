---
name: package-development
description: Package registration. Use when adding a workspace package, making a private package publishable, renaming a package, or moving its workspace path.
---

Treat package work as a registration change, not a directory copy.

## Workflow

1. Inspect the closest package in the same family. Classify publication status,
   runtime, test environment, platform support, barrels, and dependency shape.
   Justify each proposed file by precedent or an explicit repository need.
   Continue when every proposed file is justified.
2. Create or move only required source, test, TypeScript, and manifest files.
   When manifest dependencies change, read [dependencies.md](dependencies.md)
   and classify every entry by role.
   Continue when pnpm discovers the intended name and manifests reference no
   absent file.
3. Read [registration.md](registration.md). Classify every registration surface
   as applicable or not applicable and update every applicable surface.
   Continue when every surface is classified and old references are explained.
4. For a published package, read [publishing.md](publishing.md) and verify its
   development and packed surfaces.
5. Run codegen when the package owns generated barrels, then inspect generated
   sections rather than editing them manually.
   Continue when generated sections match source modules without manual edits.
6. Run focused package tests and scripts plus applicable root checks. Include
   public API type tests when applicable. For published packages, build and dry
   pack the package as described in [publishing.md](publishing.md).
   Continue when focused and root checks pass and the packed surface is intended.
7. Apply root changeset, generated-file, documentation, and workflow routing.

The task is complete when package discovery, registration, generated output,
validation, packed output, and changeset routing are all verified or reported
as not applicable.
