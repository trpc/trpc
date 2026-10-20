---
title: Should the Vercel deployment check be required on `v12`?
summary: A failed docs deploy shows on the commit but blocks nothing; making the check required would also block today's direct pushes to `v12`.
area: docs-site
recommended: A
links:
  - kind: decision
    label: docs-website-on-vercel
    url: ../decisions/docs-website-on-vercel.md
  - kind: decision
    label: landing-on-v12
    url: ../decisions/landing-on-v12.md
  - kind: code
    label: www/vercel.json
    url: ../../www/vercel.json
  - kind: code
    label: tooling/vercel-ignore
    url: ../../tooling/vercel-ignore/
  - kind: code
    label: CI workflow (next.yml, www job)
    url: ../../../.github/workflows/next.yml
---

# Should the Vercel deployment check be required on `v12`?

## Why it matters

The docs site deploys from `v12` to `v12.trpc.io` as the `trpc-v12` project, and each deploy posts a `Vercel – trpc-v12` status on its commit. Agents push straight to `v12` with `pnpm land`; the branch's rules today are only no deletion, no force push and linear history. From 2026-10-18 20:05 to 2026-10-19 23:42, 79 production deploys failed while nothing stopped commits landing: Vercel's build ran out of memory compiling Twoslash blocks, and each failure left the next build a staler cache. The heap fix landed on 2026-10-20, and every deploy since has passed.

## Options

### A) Keep it optional

A failed deploy shows on the commit; CI's `www` job builds the same site on every push.

```bash
pnpm land
pnpm ci:wait    # next.yml's jobs, www included; Vercel's status is only shown on the commit
```

- ✅ "Push straight to `v12`" keeps working, with no bypass list
- ✅ The `www` job already fails on what breaks the site's build (Twoslash errors, broken links)
- ❌ A deploy that fails only on Vercel (memory, cache, project settings) isn't blocked, and went unnoticed for a day

### B) Required in the `v12` ruleset

Add `Vercel – trpc-v12` as a required status check.

```text
Settings → Rules → v12 ruleset → Require status checks to pass: "Vercel – trpc-v12"
Bypass list: every agent and human who pushes to v12
```

- ✅ A commit whose deploy failed can't be built on
- ❌ A required check rejects a direct push, since a new commit has no status yet; every pusher needs a bypass, which makes the rule moot for them
- ❌ Ignored deploys (nothing the site renders changed) must still report success, or unrelated commits are blocked

### C) Required, landing through a `v12-*` preview branch

`pnpm land` pushes the commits to a `v12-<name>` branch, waits for its preview's check, then fast-forwards `v12`.

```bash
pnpm land    # push v12-<name>, wait for "Vercel – trpc-v12", then push HEAD:v12
```

- ✅ The check is real and nothing needs a bypass
- ❌ Each land waits for a preview build, up to 16 minutes cold, and `v12` moves about a hundred times a day, so many lands rebase and wait again
- ❌ A tooling change to `pnpm land`, and a preview per land on Vercel's build minutes

## Recommendation

**A.** The failures were one cause, now fixed, and the `www` job catches what a change to the site can break. Making Vercel's check required costs direct pushes (B) or a preview build per land (C) to guard against the platform rather than against code.

## Blocked until answered

- Nothing.

## Details

- Statuses on the last 600 `v12` commits, read from GitHub: 79 `FAILURE`, all between 2026-10-18 20:05 and 2026-10-19 23:42, and 442 `SUCCESS`, including every one on 2026-10-20. Commits pushed together get one status, on the tip.
- The failures agents saw as intermittent (`0967c4d1e`, `39f542197`, `5af84b5f7`, `b79490a9f`, `59755cc44`) are all in that window; the out-of-memory cause and the 2026-10-20 fix are in [docs-website-on-vercel](../decisions/docs-website-on-vercel.md).
- Agents can't read the `trpc` team's Vercel logs, so a Vercel-only failure needs the human or the `www` job to diagnose.
- `pnpm ci:wait` waits only for `next.yml`; it could also wait for the Vercel status on the commit without making it required, a tooling change on top of A.
