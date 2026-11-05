---
name: pr-agent-callout
description: Keep a callout at the top of a PR body while an agent is working on the PR, saying what it is doing now, and remove it once the agent no longer plans to push. Use when starting, changing or stopping work on any PR you push to, including other people's.
---

# PR agent callout

While an agent works on a PR, the PR body starts with a callout that says so and what the agent is doing right now. People can see at a glance that more pushes may come.

## When

- **Add** it when you start work on a PR you will push to: one you open, or someone else's PR where you push commits. When you open a PR, put it in the first body.
- **Update** it when your activity changes, such as from fixing a test to waiting for CI so you can fix what fails.
- **Remove** it as soon as you no longer plan to push: the work is done, you handed off, or you are waiting on a human for a review, a decision or an answer. Remove it before your final message, and add it again if you come back.
- Don't add it to PRs you only read or review. Anyone may clear a stale callout left by an agent that stopped.

## Template

```md
<!-- agent-callout:start -->
> [!NOTE]
> 🤖 An agent is working on this PR: <activity> ([agent run](<run-url>))
<!-- agent-callout:end -->

<the rest of the body>
```

- `<activity>`: what you are doing now, in one line.
- ` ([agent run](<run-url>))` is optional. Add it when your run has a URL.
- The markers let the script replace or remove the callout without touching the rest of the body. Keep one callout per body, and change it with the script, not by hand.
- Don't write the markers anywhere else in the body, even in code spans; the script then refuses the body.

## Script

`callout.sh`, beside this file, needs bash, `gh` and coreutils. Run it inside the repository with the PR's branch checked out; it finds the PR with `gh pr view`. `gh` uses `GH_TOKEN` and `GH_REPO` when they are set.

```sh
<skill-dir>/callout.sh set "Fixing the failing test" https://example.com/my-run
<skill-dir>/callout.sh set "Waiting for CI"
<skill-dir>/callout.sh clear
```

- `set` puts the callout first, or replaces it where it is. `clear` removes it and the blank line after it.
- Both keep the rest of the body byte for byte, including CRLF line endings, and skip the edit if nothing changes.
- They exit non-zero with a message if the branch has no PR, `gh` fails or the body has unmatched markers.
- `bash <skill-dir>/callout.test.sh` tests the script against a stub `gh`.

If a tool writes the whole PR body, such as one that opens the PR, include the callout at the start of the body you send it. If you can't edit the body, say so in your final message.
