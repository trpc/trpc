# Pre-commit lint-fix + `vp lint -c .oxlintrc.json`

- `vp lint` does **not** read `.oxlintrc.json` on its own (it reads `vite.config.ts` `lint`, which is unset). Without `-c .oxlintrc.json` it uses defaults: findings are warnings (exit 0) and `.repos/` isn't ignored. Every `vp lint` invocation (scripts, lint-staged) passes `-c .oxlintrc.json`.
- Pre-commit: husky → `lint-staged --concurrent false`: `vp lint --fix` on JS/TS first, then `vp fmt` on all files, so formatting cleans up after fixes. Unfixable lint errors block the commit.
