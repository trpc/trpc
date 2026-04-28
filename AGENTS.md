# Agent workflow

- Use `pnpm` for all package management and script execution.
- After making code changes, stage and commit them before final verification.
- Run `pnpm check-everything` from the repository root after each verification commit.
- `pnpm check-everything` is a `run-p check-everything:*` fan-out. Keep the subcommands green instead of introducing one-off verification flows.
- Treat `pnpm check-everything` as a loop:
  1. commit your current changes,
  2. run `pnpm check-everything`,
  3. if it fails or makes autofixes, inspect the output and working tree,
  4. commit the follow-up fixes,
  5. rerun `pnpm check-everything`,
  6. repeat until it passes with a clean working tree.
- Do not consider the work complete until `pnpm check-everything` exits successfully and `git status --short` is empty.
- If you only need the quick read-only subset while iterating, you may run `pnpm autocheck`, but the final verification must still use `pnpm check-everything`.
