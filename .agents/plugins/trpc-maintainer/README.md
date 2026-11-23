# trpc-maintainer

A Claude Code plugin with skills for tRPC maintainers. It is opt-in: the skills in `.agents/skills/` load for everyone who works in this repo, and these load only for those who install the plugin.

## Install

```sh
/plugin marketplace add trpc/trpc
/plugin install trpc-maintainer@trpc
```

To try a local checkout without installing:

```sh
claude --plugin-dir .agents/plugins/trpc-maintainer
```

## Skills

- [`review-external-pr`](skills/review-external-pr/SKILL.md): review a PR from outside the core team, look for related PRs and issues, then ask what to do. Run it with `/trpc-maintainer:review-external-pr <PR number>`, or ask Claude to review, approve or merge an external PR.

It needs `gh` or the GitHub MCP tools to read PRs, and Executor to act as trpc-bot.

## Add a skill

Add `skills/<name>/SKILL.md`, list it above, then check the plugin:

```sh
claude plugin validate .agents/plugins/trpc-maintainer --strict
```
