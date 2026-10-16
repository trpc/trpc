---
name: jsdocs
description: Public API JSDoc. Use when authoring or reviewing Effect API documentation, refining a module's documentation, or fixing documentation related diagnostics.
---

## Workflow

1. Inspect the declaration, implementation, nearby JSDoc, tests, and call sites.
2. Select every applicable branch and load its reference before editing:
   - tags, modules, or links: [declarations.md](declarations.md);
   - categories: [categories.md](categories.md);
   - examples: [examples.md](examples.md).
3. Make a focused API fix or module refinement. Preserve verified facts and
   valuable examples rather than rewriting mechanically.
4. For module refinement or APIs with close alternatives, audit `@see` links
   and inspect implementation and tests for concrete `**Gotchas**`.
5. Run `pnpm jsdocs --check` and every applicable root validation command.

`@internal` declarations and default exports are outside public JSDoc
authoring. Checked files do not support exported enums or empty export
declarations.

Public declarations use a multiline block with one self-contained practical
description paragraph. Start functions and methods with a present-tense action;
match nearby noun-family phrasing for values. Optional non-empty sections appear
once in this order: `**When to use**`, `**Details**`, `**Gotchas**`. Separate
descriptions, sections, examples, and tags with one blank line. `**When to
use**` states a positive use case distinct from the description; reserve
`**Gotchas**` for concrete caveats and failure modes.

The task is complete when every changed public declaration satisfies each
applicable reference, the checker passes, runnable examples pass their targeted
doctest, and all other applicable root checks pass or are reported as not run.
