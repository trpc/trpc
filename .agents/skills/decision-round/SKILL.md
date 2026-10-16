---
name: decision-round
description: Walk Alex through open tRPC vNext decisions one at a time with a progress count, then act on the answers. "skip" defers an item to the agent's best call; "done" stops asking and implements everything answered so far. Use when Alex asks for a decision round, to go through open decisions or questions, to review agent calls, or says "ask me" about decisions in next/.agent-docs.
---

# Decision round

Ask Alex one decision at a time. Collect answers until he says `done` (or the queue runs out), then record and implement them in one go.

Work from `next/`, with `nvm use` first. Follow `next/AGENTS.md` and `next/.agent-docs/README.md#decisions` for the decision file format.

## 1. Build the queue

Gather candidates, then drop any that a `(human)` decision already answers:

1. **Open points waiting on Alex:** run `pnpm decisions --open`. Include bullets addressed to Alex (`Open (Alex)`, "for Alex", "Alex's"). Leave out items blocked outside the repo, such as an upstream release.
2. **Proposal questions without a human answer:** run `pnpm decisions --questions`. Include every `Qn.m` that only `(agent)` decisions cite.
3. **Agent calls to review:** run `pnpm decisions --who agent`, plus `--agent-bullets` for agent calls inside human files. Include these only when Alex asks to review agent calls, or names a topic.

If Alex names a topic ("decide openapi"), filter every source with `pnpm decisions <regex>` and `rg -n "<topic>" .agent-docs/proposals/`.

Order the queue as listed above, then by leverage: parity-critical (⚠️) and blocking items first (see "If you only answer a few questions" in `.agent-docs/README.md`). Merge items that are really one choice.

Before the first question, say in one line how many items there are and where they come from.

## 2. Ask one at a time

Send each item as its own short message, then stop and wait for the reply:

```
Decision 3 of 12 · 2 answered · 0 skipped
Q12.1 Platform core: own web core or effect/http?   [platforms-through-effect-layers.md]

Today: trpcdev serves on Effect's HttpServer through layers (built, agent's call).
A) Keep effect/http as the core (current, recommended: Effect-native, already built)
B) Own web-standard core, with Effect layers only for platforms
C) Something else, in your words

Reply with a letter or your own words, `skip`, or `done`.
```

- Keep context to two to four lines: what exists today and what each option costs. Read the proposal and decision before writing, so the options match what is actually built.
- Mark one option as recommended. Choose it Effect-native first, v11's way second (`decisions/effect-native-by-default.md`).
- For an agent call under review, option A is "Keep" and the others are real alternatives.
- If the reply is a question ("why?", "show the code"), answer it briefly, then ask the same item again without advancing the count.
- Keep a running list of every answer, with Alex's exact words. The final step needs it.

### Replies

| Reply                          | Do                                                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A letter or free text          | Record the answer verbatim as Alex's, then go to the next item.                                                                                                                                    |
| `skip`                         | Defer to the agent: pick the best option (Effect-native first, v11 second), say the pick in one line ("Skipped: going with A"), then go to the next item. It is recorded as `(agent)`, not Alex's. |
| `done`                         | Stop asking and go to step 3. Unasked items stay open.                                                                                                                                             |
| `back`                         | Re-ask the previous item; the new answer replaces the old one.                                                                                                                                     |

When the queue is empty, go to step 3 as if Alex had said `done`.

## 3. Action as far as possible

1. **Record every answer** under `.agent-docs/decisions/`:
   - **Alex's answer:** the file's title is `(human)`, or `(human asked)` when he set the outcome and left the details to the agent. Add a bullet quoting him: `Alex, <date> (Q12.1): "<his words>"`. If an `(agent)` file exists for that topic, edit it: change the title marker, and keep any agent details as `(agent)` bullets.
   - **A skipped item:** the file stays or becomes `(agent)`, with a bullet `(agent) Alex skipped this in the decision round, <date>; chose <option> because <reason>.` That keeps every skipped item findable with `pnpm decisions "decision round"`.
   - **A new topic:** create a new `decisions/<topic>.md` with Why, Lost, Open and Lives in bullets. Don't fill the Decision blocks in proposals.
   - **Questions:** every answered `Qn.m` must be cited by a decision file, so `pnpm decisions --questions` shows it.
2. **Ripple:** update the proposals, `docs/`, `.agent-docs/reference/orpc-parity.md` and the notes that the answers change.
3. **Implement** what the answers require: code in Effect style, tests and docs. A `(human)` answer that reverses built code means changing that code, not just the docs. For work that can't be finished (it needs credentials, an upstream release, or another answer), leave an `Open:` bullet saying what is missing.
4. **Gates:** run `pnpm fix`, `pnpm check`, `pnpm typecheck`, `pnpm test` and `pnpm example`. Fix anything that fails.
5. **Ship** semantic commits, one per logical change (decisions with their implementation). Run `git fetch origin v12`, check `git log HEAD..origin/v12`, run `git push origin v12`, then watch CI with `gh run list --repo KATT/trpc-playground --branch v12`. No PRs, never the `trpc/trpc` remote, never force-push.

## 4. Report

Keep it short and readable on a phone:

- **Decided by Alex:** each item, with what it changed and the commit.
- **Skipped (agent's call):** each item and the pick, so Alex can revisit it later with `pnpm decisions "decision round"`.
- **Still open:** what wasn't asked or couldn't be finished, and why.
- **Gates and CI:** results.
