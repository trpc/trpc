---
name: ai-docs
description: AI documentation. Use when editing ai-docs/src or regenerating LLMS.md.
---

Read `ai-docs/README.md`; it owns source structure, style, examples, generation,
and changeset policy.

1. Inspect neighboring source examples and the relevant current `LLMS.md`.
2. Edit sources under `ai-docs/src`, then run `pnpm ai-docgen`.
3. Review generated output for ordering, missing content, and unrelated changes.
4. Run applicable root validation.

The task is complete when sources and generated output agree, every generated
difference is explained, TypeScript checks pass when examples or fixtures
change, and applicable checks pass or are reported as not runnable.
