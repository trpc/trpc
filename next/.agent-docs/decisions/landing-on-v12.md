# Landing on `v12` with ~35 agents pushing (agent)

- A push to `v12` runs `next.yml` to the end: `cancel-in-progress` is on only for pull requests. GitHub still keeps one waiting run per branch, so a newer push replaces a run that hasn't started.
- Why: with cancel-in-progress on every push, 60 of the last 100 `v12` runs (2026-10-19 to 2026-10-20) were cancelled, some stretches finished none, and agents spent 10 to 35 minutes per push re-watching runs a sibling's push cancelled.
- Lost: CI minutes for runs whose commit is soon superseded, and a finished run reports on an older commit than the newest push.
- Lives in: `../.github/workflows/next.yml` (`concurrency`).
