---
name: bundle-analysis
description: Bundle analysis. Use when measuring current bundle size, comparing stable or selected fixtures, inspecting composition, or cleaning retained comparison state.
---

Read `packages/tools/bundle/README.md`, then select one workflow:

- **Stable comparison:** `pnpm bundle-compare <base-ref>`. Use `HEAD~1` for the
  latest commit. Read `tmp/bundle-stats.txt` and report non-zero differences.
- **Selected comparison:** `pnpm bundle-compare-selected --base <ref>
  scratchpad/<fixture>.ts`. Use only user-named or investigation-local fixtures;
  keep temporary fixtures out of the stable corpus.
- **Composition:** `pnpm bundle-analyze scratchpad/<fixture>.ts`. Read raw data
  first and report the largest modules, dependency groups, and surprising
  inclusions. Its readable-name output is not an exact size measurement.
- **Current size:** Build immediately before the direct bundle report so Effect
  packages resolve from current `dist` output.
- **Cleanup:** Stable comparisons retain `tmp/bundle-base` for reuse unless
  cleanup is requested. Remove selected-comparison state retained with
  `--keep-base` after its final use. Verify cleanup without disturbing unrelated
  worktrees.

The task is complete when the selected artifact is inspected, requested size or
composition findings are reported, generated paths are named, and comparison
state follows the selected workflow's retention policy.
