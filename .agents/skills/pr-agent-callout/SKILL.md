---
name: pr-agent-callout
description: Put a callout at the top of a PR body while an agent is working on the PR, and remove it once the agent no longer plans to push. Use when starting or stopping work on any PR you push to, including other people's.
---

# PR agent callout

While you work on a PR you push to, its body starts with a callout saying what you're doing. Use `callout.sh` beside this file, from the repository with the PR's branch checked out:

```sh
<skill-dir>/callout.sh set "<what you're doing>" [run-url]
<skill-dir>/callout.sh clear
```

- **Start of each round of work** (first push, review fixes, a CI fix): `set` once with a one-line summary of the round. Don't update it step by step.
- **When you stop planning to push** (done, handed off, or waiting on a human): `clear`, before your final message.
- If `gh`'s token can't edit pull requests, set `GH_TOKEN` (`GH_ENTERPRISE_TOKEN` on GitHub Enterprise Server) to one that can. If none can, say so in your final message.
- When a tool writes the whole body, such as when opening the PR, run `set` right after it.
