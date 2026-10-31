---
name: pull-requests
description: Pull request finalization. Use when a change works and is about to be opened as a pull request, or when updating or continuing an existing one.
---

A pull request is ready when its tests, implementation, comments, and changeset
are each the simplest that cover the intended behavior. Draft PRs can be used
earlier; finishing means making the PR ready for review.

## Workflow

Run each step in a fresh-context subagent when available; otherwise run it
yourself. Pass along the task context and prior results so each step can check its gate.

1. Keep tests focused. Read [test-development](../test-development/SKILL.md) for
   test placement and type. Cover each intended behavior once, in the existing
   test file for the module.
   For changes needing no tests, record why.
   Continue when removing any remaining case would leave intended behavior
   uncovered, or no tests are needed.
2. Simplify the implementation. With the tests passing, look for a simpler or
   more idiomatic version: reuse helpers and patterns from nearby source and
   [effect-development](../effect-development/SKILL.md), and remove debugging
   code, scaffolding, and changes unrelated to the task.
   Continue when applicable targeted tests pass and every hunk in the diff
   from the merge base is required by the task.
3. Review the full diff from the merge base as a maintainer would: correctness,
   failure and interruption paths, resource cleanup, naming and API
   consistency with neighboring modules, and documentation. Fix findings and
   review again.
   Continue when a review pass produces no findings.
4. Clean up. Remove comments that restate code or narrate the change; keep the
   rest short and about why. Finalize the changeset with
   [changesets](../changesets/SKILL.md).
   Continue when comments explain only what code cannot, and the changeset
   describes the final consumer impact or the no-changeset reason is recorded.
5. Run the validation in the [AGENTS.md validation table](../../AGENTS.md#validation)
   for each change type in the diff. Fix failures caused by the change; if
   fixes alter the diff, repeat the affected passes.
   Continue when applicable checks pass or commands that cannot run and their
   blockers are recorded.
6. Open or update the pull request. Title: a short imperative summary.
   Description: the problem addressed, notable decisions, and `Closes #<issue>` for each
   GitHub issue resolved. Do not narrate the diff. Mark the PR ready for review.
   Continue when the final changes are pushed, the description matches the
   final diff, and the PR is ready for review.

The task is complete when each step's gate holds, validation has passed or
been reported as not runnable with reasons, and the pull request is ready for
review with a description matching the final diff.
