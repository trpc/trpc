---
name: test-development
description: Test development. Use when adding or changing Vitest or Tstyche coverage. Choose Tstyche only for intended compiler behavior such as inference, assignability, rejection, or displayed public types.
---

Choose branches from the task's acceptance criteria before editing:

- **Runtime behavior:** The intended result is observable when code executes.
  Read [runtime.md](runtime.md).
- **Compiler behavior:** The intended result is TypeScript accepting, rejecting,
  or inferring a consumer expression in a particular way. Read
  [types.md](types.md).

An exported signature alone is validated by `pnpm check`; it enters the compiler
branch only when its inference, assignability, rejection, overload selection, or
displayed type is part of the task. Some changes require both branches because
they independently change runtime and compiler behavior.

The task is complete when each intended behavior in scope has the relevant
focused coverage, targeted tests pass, and applicable root checks pass or are
reported as not runnable.
