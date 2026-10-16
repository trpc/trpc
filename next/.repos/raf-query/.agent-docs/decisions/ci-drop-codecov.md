# CI does not upload coverage to Codecov (agent)

- Dropped `codecov/codecov-action@v3` and `--coverage` from the Test job. Every sampled run failed the upload with HTTP 429 (no `CODECOV_TOKEN`); the step still exited 0.
- Local `pnpm test --coverage` and the packages' coverage config stay. Lost: keeping a broken upload “for later”; wiring `CODECOV_TOKEN` + `codecov-action@v5` (owner can add that later if they want reports again).
