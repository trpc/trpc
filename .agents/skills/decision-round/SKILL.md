---
name: decision-round
description: Walk the human through open tRPC vNext decisions one at a time with a progress count, then act on the answers. "skip" defers an item to the agent's best call; "done" stops asking and implements everything answered so far. Use when the human asks for a decision round, to go through open decisions or questions, to review agent calls, or says "ask me" about decisions in next/.agent-docs.
---

# Decision round

Ask the human one decision at a time. Collect answers until they say `done` (or the queue runs out), then record and implement them in one go. Never write the human's name in docs, decisions or code; say "human" (commit history has the author).

Work from `next/`, with `nvm use` first. Follow `next/AGENTS.md` and `next/.agent-docs/README.md#decisions` for the decision file format.

## 1. Build the queue

Gather candidates, then drop any that a `(human)` decision already answers:

1. **Open points waiting on a human:** run `pnpm decisions --open`. Include bullets addressed to a human (`Open (human)`, "for a human", "pending a human"). Leave out items blocked outside the repo, such as an upstream release.
2. **Proposal questions without a human answer:** run `pnpm decisions --questions`. Include every `Qn.m` that only `(agent)` decisions cite, unless an `(agent)` file already quotes a human answer for it.
3. **Agent calls to review:** run `pnpm decisions --who agent`, plus `--agent-bullets` for agent calls inside human files. Include these only when the human asks to review agent calls, or names a topic.
4. **Tentative answers to revisit:** run `pnpm decisions --tentative`. Include these only when the human asks to revisit them, or names a topic.

If the human names a topic ("decide openapi"), filter every source with `pnpm decisions <regex>` and `rg -n "<topic>" .agent-docs/proposals/`.

Order the queue as listed above, then by leverage: parity-critical (⚠️) and blocking items first (see "If you only answer a few questions" in `.agent-docs/README.md`). Merge items only when they are really one choice. Ask each proposal question on its own, even when one decision file answers several; drop a question that an earlier human answer already settles, and say so.

Before the first question, say in one line how many items there are and where they come from.

## 2. Ask one at a time

Send each item as its own short message, then stop and wait for the reply. Write it as markdown, not inside a code block, so the title renders as a heading on a phone:

````md
### 🗳️ 3/12: Should the platform core be our own web core or effect/http?

`Q12.1` · [platforms-through-effect-layers.md] · 2 answered · 0 skipped

**Today:** `@trpc12/trpc` serves on Effect's `HttpServer` through layers (built, agent's call).

- **A)** ⭐ **Recommended:** keep effect/http as the core
  - ✅ Effect-native, already built
  - ❌ Effect's HTTP types show up in adapter code
- **B)** Own web-standard core, with Effect layers only for platforms
  - ✅ No Effect in the request path
  - ❌ Two cores to keep in step
- **C)** Something else, in your words

Reply with a letter or your own words, `skip`, or `done`.
````

- The title is the question itself, in plain words, readable without the rest of the message. Never title an item with an internal label ("Spike C", "option D"): name the thing ("a plain React `use()` hook package").
- Spell out every name in the options the first time it appears in the item, even if an earlier item explained it.
- Keep context to two to four lines: what exists today and what each option costs. Read the proposal and decision before writing, so the options match what is actually built.
- Use bullet points, always. Give each option short pros and cons (✅ / ❌), and make the recommended pick easy to spot: put ⭐ **Recommended** on it. Emojis are welcome where they help scanning.
- When the choice is about API shape, show each option as a short code excerpt, on a phone too.
- On a phone, be concise: one short code excerpt, a few bullets. On a desktop, be more thorough: link the spike, note and decision files, and show more code.
- Point out when an earlier answer in the round changes this item (for example a new default), and adjust the options and the recommendation to it.
- Mark one option as recommended. Choose it Effect-native first, v11's way second (`decisions/effect-native-by-default.md`).
- For an agent call under review, option A is "Keep" and the others are real alternatives.
- If the reply is a question ("why?", "show the code"), answer it briefly, then ask the same item again without advancing the count.
- If a free-text answer is open to more than one reading, say your reading in one line before the next item, so the human can reply `back`.
- Keep a running list of every answer, with the human's exact words. The final step needs it.

### Replies

| Reply                 | Do                                                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A letter or free text | Record the answer verbatim as the human's, then go to the next item. "Do recommended" is the recommended option, chosen by the human.                                                                                                                                     |
| A hesitant answer     | "I don't get this", "might change", "not sure": record it as the human's, but tentative (step 3), and say so in one line.                                                                                |
| `skip`                | Defer to the agent: pick the best option (Effect-native first, v11 second), say the pick in one line ("Skipped: going with A"), then go to the next item. It is recorded as `(agent)`, not the human's. |
| `done`                | Stop asking and go to step 3. Unasked items stay open.                                                                                                                                                   |
| `back`                | Re-ask the previous item; the new answer replaces the old one.                                                                                                                                           |

When the queue is empty, go to step 3 as if the human had said `done`.

## 3. Action as far as possible

1. **Record every answer** under `.agent-docs/decisions/`:
   - **The human's answer:** the file's title is `(human)`, or `(human asked)` when they set the outcome and left the details to the agent. Add a bullet quoting them: `Human, <date> (Q12.1): "<their words>"`. If an `(agent)` file exists for that topic, edit it: change the title marker, and keep any agent details as `(agent)` bullets.
   - **A tentative answer:** as above, plus a bullet `Tentative (human): <why, in their words>. Challenge it when it gets in the way.` `pnpm decisions --tentative` lists these.
   - **A skipped item:** the file stays or becomes `(agent)`, with a bullet `(agent) Skipped in the decision round, <date>; chose <option> because <reason>.` That keeps every skipped item findable with `pnpm decisions "decision round"`.
   - **A new topic:** create a new `decisions/<topic>.md` with Why, Lost, Open and Lives in bullets. Don't fill the Decision blocks in proposals.
   - **Questions:** every answered `Qn.m` must be cited by a decision file, so `pnpm decisions --questions` shows it.
2. **Ripple:** update the proposals, `docs/`, `.agent-docs/reference/orpc-parity.md` and the notes that the answers change.
3. **Implement** what the answers require: code in Effect style, tests and docs. A `(human)` answer that reverses built code means changing that code, not just the docs. An answer of "spike it" means a spike under `spikes/` and a note in `.agent-docs/notes/`, not shipped code. For work that can't be finished (it needs credentials, an upstream release, or another answer), leave an `Open:` bullet saying what is missing.
4. **Gates:** run `pnpm fix`, `pnpm check`, `pnpm typecheck`, `pnpm test` and `pnpm example`. Fix anything that fails.
5. **Ship** semantic commits, one per logical change (decisions with their implementation). Run `git pull --rebase origin v12`, then `git push origin v12`, then watch CI with `gh run list --repo trpc/trpc --branch v12`. No PRs, never `main`, never force-push, no merge commits.

## 4. Report

Keep it short and readable on a phone:

- **Decided by you:** each item, with what it changed and the commit. Mark tentative ones.
- **Skipped (agent's call):** each item and the pick, so they can be revisited later with `pnpm decisions "decision round"`.
- **Still open:** what wasn't asked or couldn't be finished, and why.
- **Gates and CI:** results.
