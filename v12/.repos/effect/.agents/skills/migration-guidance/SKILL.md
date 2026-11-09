---
name: migration-guidance
description: Use when changing how a v3 public API maps to v4, editing migration annotations, or regenerating migration/v3-to-v4.md.
---

Update guidance when a v3 public module or API is renamed, moved, removed,
replaced, or gains a materially different v4 contract. A v4-only API without a
v3 counterpart does not automatically need an annotation.

1. Account for every affected v3 symbol.
2. Read [annotations.md](annotations.md) before adding or changing annotation
   YAML. Verify every suggested replacement against implementation and tests.
3. When checking or regenerating the reference, or when the API change exists in
   a committed ref, read [generation.md](generation.md). Otherwise report that
   generation is deferred.
4. When output was generated, inspect it for unrelated movement and stale refs.

The task is complete when every affected v3 symbol is accounted for, annotation
replacements are verified, checks and generation succeed when the change is in
a committed ref, and every generated difference is explained. Report deferred
checks explicitly for uncommitted API changes.
