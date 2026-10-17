# `v12` lives on trpc/trpc; YOLO push, no PRs (human)

- Human, 2026-10-17: "i want to move origin/v12 to the v12 branch of trpc/trpc"; "we still wanna yolo commit/push and never open PRs"; "also we should make sure that `main` is protected and not even me can't push straight to it"; "also we want linear history on v12". Overrides the brief's "push to KATT/trpc-playground rather than trpc" ([`brief.md`](./brief.md)).
- `v12` is the branch on [trpc/trpc](https://github.com/trpc/trpc). Local remotes: `origin` → trpc/trpc, `playground` → [KATT/trpc-playground](https://github.com/KATT/trpc-playground) (frozen; stop pushing to it).
- YOLO semantic commits straight to `v12`. No PRs for vNext work.
- Never push to `main`. Never force-push `v12`. No merge commits on `v12` (required linear history). Catch up with `git pull --rebase origin v12`.
- `main` is locked so no human (including admins) can push directly; only a dedicated release GitHub App can, for v11 version commits and tags. Admins and `trpc-core` keep pull-request bypass only.
- Why: vNext work belongs on the real repo; the playground was a staging ground. Keeping YOLO-to-branch preserves the rewrite's speed. Locking `main` stops accidental direct pushes while releases still work.
- Lost: a separate private staging remote; the ability for admins to push straight to `main` without first changing a ruleset.
- Open: none for the branch move. The release App and `release.yml` switch are the implementation of the `main` lockdown.
- Lives in: `.agent-docs/approach.md` (workflow), `.agents/skills/decision-round/SKILL.md` (ship step), GitHub rulesets on trpc/trpc (`v12`, `main`, `main (core team)`), `.github/workflows/release.yml` (App token).
