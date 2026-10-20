---
name: decision-round
description: Walk the human through open tRPC vNext decisions one at a time with a progress count, each as a short summary linking its page under v12.trpc.io/v12/decisions, then act on the answers. "skip" defers an item to the agent's best call; "done" stops asking and implements everything answered so far. Use when the human asks for a decision round, to go through open decisions or questions, to review agent calls, or says "ask me" about decisions in next/.agent-docs.
---

# Decision round

Ask the human one decision at a time. Collect answers until they say `done` (or the queue runs out), then record and implement them in one go. Never write the human's name in docs, decisions or code; say "human" (commit history has the author).

Work from `next/`, with `nvm use` first. Follow `next/AGENTS.md` and `next/.agent-docs/README.md#decisions` for the decision file format.

## 1. Build the queue

Gather candidates, then drop any that a `(human)` decision already answers:

1. **Open questions:** run `pnpm decisions --pending`. Each file in `.agent-docs/open/` is one item, already written up: its options, code, recommendation and links are the item's content ([`open/README.md`](../../../next/.agent-docs/open/README.md)). Ask these first.
2. **Open points waiting on a human:** run `pnpm decisions --open`. Include bullets addressed to a human (`Open (human)`, "for a human", "pending a human"). Leave out items blocked outside the repo, such as an upstream release.
3. **Proposal questions without a human answer:** run `pnpm decisions --questions`. Include every `Qn.m` that only `(agent)` decisions cite, unless an `(agent)` file already quotes a human answer for it.
4. **Agent calls to review:** run `pnpm decisions --who agent`, plus `--agent-bullets` for agent calls inside human files. Include these only when the human asks to review agent calls, or names a topic.
5. **Tentative answers to revisit:** run `pnpm decisions --tentative`. Include these only when the human asks to revisit them, or names a topic.

Items from 2 and 3 should already have an open file. When one doesn't, write it (template in `open/README.md`) before asking, so an unanswered item stays findable after the round.

If the human names a topic ("decide openapi"), filter every source with `pnpm decisions <regex>` and `rg -n "<topic>" .agent-docs/proposals/`.

Order the queue as listed above, then by leverage: parity-critical (⚠️) and blocking items first (see "If you only answer a few questions" in `.agent-docs/README.md`). Merge items only when they are really one choice. Ask each proposal question on its own, even when one decision file answers several; drop a question that an earlier human answer already settles, and say so.

Before the first question, say in one line how many items there are and where they come from.

## 2. Ask one at a time

Send each item as its own short message, then stop and wait for the reply. Keep it a summary: the question, one line per option, the recommendation, and a link to the item's page for everything else. Don't paste pros and cons, code or background into the message; the page has them. Write it as markdown, not inside a code block, so the title renders as a heading on a phone:

```md
### 🗳️ 3/12: Should `createSafeClient` make iteration safe on its own?

`Q24.4` · 2 answered · 0 skipped · [Details](https://v12.trpc.io/v12/decisions/open/safe-client-iteration)

- **A)** Keep `safe()` around each iteration
- **B)** ⭐ The safe client iterates safely too
- **C)** A separate `.safeSubscribe()`

**Recommended: B**, because one client then never throws. Reply with a letter or your own words, `skip`, or `done`.
```

- **Details link:** an item with an open file links its page, `https://v12.trpc.io/v12/decisions/open/<file name without .md>`: its options' code, pros and cons, and its spike, PR and preview links. An item from a decision (an `Open:` bullet, an agent call, a tentative answer) links that decision's page, `https://v12.trpc.io/v12/decisions/<file name without .md>`. The pages are deployed from `v12`, so a file written in this round has no page yet: land it first (`pnpm land`, then wait for the deployment), or link the file on GitHub, `https://github.com/trpc/trpc/blob/v12/next/.agent-docs/<folder>/<file>`, until it does.
- The title is the question itself, in plain words, readable without the rest of the message. Never title an item with an internal label ("Spike C", "option D"): name the thing ("a plain React `use()` hook package").
- One line per option, under about ten words, naming the thing it does. Spell out every name the first time it appears in the item, even if an earlier item explained it.
- The recommendation gets ⭐ on its option and a "Recommended" line with its reason in one clause. Choose it Effect-native first, v11's way second (`decisions/effect-native-by-default.md`). It should match the open file's `recommended:`; when an earlier answer in the round changes it, say so in that line.
- Read the open file (or the proposal and decision) before writing, so the summary matches what the page says and what is built.
- For an agent call under review, option A is "Keep" and the others are real alternatives.
- If the reply is a question ("why?", "show the code"), answer it briefly, quoting the page's code when asked for it, then ask the same item again without advancing the count.
- If a free-text answer is open to more than one reading, say your reading in one line before the next item, so the human can reply `back`.
- Keep a running list of every answer, with the human's exact words. The final step needs it.

### Replies

| Reply                 | Do                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A letter or free text | Record the answer verbatim as the human's. Say in one line which decision it goes into, linking that record's page (`https://v12.trpc.io/v12/decisions/<topic>`, live once landed), then go to the next item. "Do recommended" is the recommended option, chosen by the human. |
| A hesitant answer     | "I don't get this", "might change", "not sure": record it as the human's, but tentative (step 3), and say so in one line.                                                                               |
| `skip`                | Defer to the agent: pick the best option (Effect-native first, v11 second), say the pick in one line ("Skipped: going with A"), then go to the next item. It is recorded as `(agent)`, not the human's. |
| `done`                | Stop asking and go to step 3. Unasked items stay open.                                                                                                                                                  |
| `back`                | Re-ask the previous item; the new answer replaces the old one.                                                                                                                                          |

When the queue is empty, go to step 3 as if the human had said `done`.

## 3. Action as far as possible

1. **Record every answer** under `.agent-docs/decisions/`:
   - **The human's answer:** the file's title is `(human)`, or `(human asked)` when they set the outcome and left the details to the agent. Add a bullet quoting them: `Human, <date> (Q12.1): "<their words>"`. If an `(agent)` file exists for that topic, edit it: change the title marker, and keep any agent details as `(agent)` bullets.
   - **A tentative answer:** as above, plus a bullet `Tentative (human): <why, in their words>. Challenge it when it gets in the way.` `pnpm decisions --tentative` lists these.
   - **A skipped item:** the file stays or becomes `(agent)`, with a bullet `(agent) Skipped in the decision round, <date>; chose <option> because <reason>.` That keeps every skipped item findable with `pnpm decisions "decision round"`.
   - **A new topic:** create a new `decisions/<topic>.md` with Why, Lost, Open and Lives in bullets. Don't fill the Decision blocks in proposals.
   - **Questions:** every answered `Qn.m` must be cited by a decision file, so `pnpm decisions --questions` shows it.
   - **Open files:** delete the `open/<topic>.md` of every answered or skipped item in the commit that records it, after copying the options given up into the decision's **Lost** bullet. Unasked items keep their files.
2. **Ripple:** update the proposals, the docs pages in `next/www/docs/`, `.agent-docs/reference/orpc-parity.md` and the notes that the answers change.
3. **Implement** what the answers require: code in Effect style, tests and docs. A `(human)` answer that reverses built code means changing that code, not just the docs. An answer of "spike it" means a spike under `spikes/` and a note in `.agent-docs/notes/`, not shipped code. For work that can't be finished (it needs credentials, an upstream release, or another answer), leave an `Open:` bullet saying what is missing.
4. **Gates:** run `pnpm fix`, `pnpm check`, `pnpm typecheck`, `pnpm test` and `pnpm example`. Fix anything that fails.
5. **Ship** semantic commits, one per logical change (decisions with their implementation). Land them with `pnpm land` and watch CI with `pnpm ci:wait` (`next/AGENTS.md`). The records' pages are live once the docs deployment finishes; check one with `curl -sI https://v12.trpc.io/v12/decisions/<file name without .md>` before linking them in the report. No PRs, never `main`, never force-push, no merge commits. A branch, when a human asks for one, is named `v12-<name>`.

## 4. Report

Keep it short and readable on a phone:

- **Decided by you:** each item, linking its decision record's page (`https://v12.trpc.io/v12/decisions/<file name without .md>`), with what it changed and the commit. Mark tentative ones.
- **Skipped (agent's call):** each item and the pick, linking its record's page the same way, so they can be revisited later with `pnpm decisions "decision round"`.
- **Still open:** what wasn't asked or couldn't be finished, and why.
- **Gates and CI:** results.
