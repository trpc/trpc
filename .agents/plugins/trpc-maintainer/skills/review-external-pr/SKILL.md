---
name: review-external-pr
description: "Review an external contributor's PR to tRPC, check for related open PRs and issues, then ask what to do: request changes, fix it up, rewrite it as a follow-up, or approve as trpc-bot and add it to the merge queue. Use when asked to review, approve or merge a PR from outside the core team."
---

# Review an external PR

Where `gh` is missing, read the same things with the GitHub MCP tools.

## 1. Read

- `gh pr view <N> --json title,body,author,files,commits,statusCheckRollup`
- `gh pr diff <N>`
- Read the linked issue. Work out what the PR claims to fix, then check the diff does that and nothing else.

## 2. Search for related work

Look for open PRs and issues that touch the same code or bug:

- `gh pr list --state open --search "<keywords>"`
- `gh issue list --state open --search "<keywords>"`
- `gh pr list --state open --json number,title,files` and look for PRs that change the same files.

Note any duplicates, conflicts, or issues this PR could also close. If several PRs fix one bug, say which is best.

## 3. Check

Block the PR if any of these fail:

- **Bug fix:** it has a regression test that fails without the fix (`pnpm vitest run <file>` on a checkout with the fix reverted), and a `Regression check:` line in the body.
- **v11 rules:** no new default that changes behaviour. A new behaviour is opt-in or goes to v12.
- **Internal params:** required, not optional (see `trpc-conventions`).
- **Public API:** types and docs (`www/v11/docs/`) are updated if the API changed.
- **CI:** green. Rerun flaky jobs once before you blame the PR.
- **Body:** follows `.github/PULL_REQUEST_TEMPLATE.md`. Has `- Closes #N` and an AI disclosure if one helped.
- **Safety:** no changes to workflows, release scripts, `package.json` scripts or dependencies that the PR does not need. Look hardest at these in PRs from first-time contributors.

Don't block on style the linter would catch, or on taste.

## 4. Write the review

Write like Orwell:

- Use short words. Cut every word you can.
- Use the active voice. "This drops the error", not "The error is dropped".
- No jargon, no hedging, no praise padding, no "Great PR!", no "nit:" walls.
- One comment per problem. Say what's wrong, why it matters, and what to do.
- Put comments inline on the line they concern. The summary is one or two sentences.

Good: "This throws if `input` is undefined. Guard it, and add a test."
Bad: "I was wondering if perhaps we might want to consider handling the case where input could potentially be undefined?"

## 5. Ask me

Post nothing yet. Show me:

- The draft review and inline comments.
- Related PRs and issues from step 2.
- Your recommendation, with one line saying why.

Then ask which to do:

1. **Approve:** in Executor, approve as trpc-bot, then add the PR to the merge queue.
2. **Request changes:** post the review as trpc-bot.
3. **Fix up:** push small fixes to the contributor's branch, if maintainer edits are on. Keep their commits and credit.
4. **Follow-up:** merge it as is, or close it, and do the rest in a new PR of ours. Credit the contributor with `Co-authored-by:`.
5. **Fold in:** merge it with a related PR or issue fix from step 2.
6. **Stop:** say what you couldn't verify.

Only do what I pick. Never merge directly.
