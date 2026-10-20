---
title: Which gates should an agent run before `pnpm land`?
summary: The README asks for every gate before every land, docs build and examples included; gates could be picked by what a change touches, with CI catching the rest.
area: tooling
recommended: B
links:
  - kind: decision
    label: landing-on-v12
    url: ../decisions/landing-on-v12.md
  - kind: code
    label: README commands
    url: ../../README.md
  - kind: code
    label: AGENTS.md, landing on v12
    url: ../../AGENTS.md
  - kind: code
    label: CI workflow (next.yml)
    url: ../../../.github/workflows/next.yml
---

# Which gates should an agent run before `pnpm land`?

## Why it matters

`next/README.md` says to run every gate before `pnpm land`, and `AGENTS.md` points there. The agent DX review of 150 sessions found slow or contended gates cost 43 agents 15 to 60 minutes each: the docs build alone is 2 to 9 minutes with Twoslash, gates were re-run after each rebase, and concurrent docs builds on one VM ran out of memory at about 3.5 GB each. Since then `pnpm land` only re-checks the changed files after a rebase, and a push to `v12` runs CI to the end, so CI now reports every break; what's left is how much each agent runs before pushing.

## Options

### A) Keep it as it is: every gate, every time

```bash
pnpm fix && pnpm check && pnpm typecheck
pnpm coverage          # runs pnpm test, fails under 98%
pnpm test:bun
pnpm example           # needs Redis and Postgres
pnpm build             # vp pack, and the docs site
pnpm bench budget
pnpm land
```

- ✅ A break almost never reaches `v12`: everything CI runs, the agent ran first
- ❌ Every change pays the docs build and every example's smoke, about 5 to 15 minutes, a doc typo included
- ❌ Concurrent docs builds on a shared VM still need a lock, or they run out of memory

### B) Always the fast gates; the slow ones by what the change touches

The review's proposal. CI's `www` and `example` jobs, which now finish, catch what a skipped gate would have.

```bash
# always
pnpm fix && pnpm check && pnpm typecheck && pnpm coverage   # or pnpm test

# the change touches www/, shared/, or a public type or export in packages/*/src
pnpm docs:build        # docs samples compile against the sources

# it touches examples/, or the server or client runtime
pnpm example

pnpm land
pnpm ci:wait           # then fix forward if a job fails
```

- ✅ A docs-only or tooling-only change lands in a few minutes; the slow gates run where they can fail
- ✅ Fewer concurrent docs builds, so fewer out-of-memory kills on shared VMs
- ❌ More breaks reach `v12` and are fixed forward, which can block other agents until the fix lands
- ❌ "Touches a public type" is a judgment call; an agent can get it wrong

### C) Only the fast gates; CI runs the rest

```bash
pnpm fix && pnpm check && pnpm typecheck
pnpm test <changed package or folder>
pnpm land
pnpm ci:wait
```

- ✅ The fastest loop; no agent ever runs the docs build or examples locally
- ❌ Docs, example and coverage breaks are found only on `v12`, after siblings have built on them
- ❌ The 98% coverage gate fails on `v12` more often, since it's never run before landing

## Recommendation

**B.** The fast gates catch most breaks in minutes, and the slow ones run where they can fail. CI runs to the end on every push now, so a skipped gate's break is reported on the first run that includes it, and `pnpm ci:wait` names the job.

## Blocked until answered

- Nothing is blocked; the README's list stays as it is until this is answered. With B or C, `next/README.md`'s "Run them all before `pnpm land`" line and `AGENTS.md`'s "run every gate listed there" change.

## Details

- CI (`.github/workflows/next.yml`) runs `typecheck`, `check`, `coverage`, `example` and `bench budget` in `check`, the docs site in `www`, `test:bun` in `bun`, and `typecheck` and `test` on the latest Effect in `effect-latest`. It doesn't run `pnpm build`: the `tooling/pack` tests in `coverage` build every package, and `www` builds the site, so B's `pnpm docs:build` stands in for `pnpm build`.
- `pnpm bench budget` never fails ([orpc-v2-parity](../decisions/orpc-v2-parity.md)); it's only needed when a change moves a client bundle's size, to update the table in `notes/benchmarks.md`.
- `pnpm land` could pick B's tiers itself from the changed paths and run them before pushing. That's a tooling change on top of B, not a different answer.
- Flakes found in the review (a `tanstack-query` subscription count, the WebSocket backpressure test, `dedupe.test.ts`) make B and C's fix-forward noisier until they're fixed.
