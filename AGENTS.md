# Agent instructions

Coding and test conventions are in [`.cursor/rules/`](.cursor/rules/).

## Pull request bodies

Fill in [the PR template](.github/PULL_REQUEST_TEMPLATE.md) and keep it short enough to read once.

- Stay under 200 words, not counting code blocks and links. Most PRs need far fewer.
- Use bullets, not walls of prose. No preamble, credits or design essays.
- Say what changed and why, not what changed in each file.
- Put each closing keyword on its own bullet (`- Closes #123`), never several issues on one line.
- Testing names the regression check in one line. Don't repeat test lists or list every suite you ran.
- Describe the PR as it is now. No review-round history, earlier revisions or approaches you dropped; edit the body instead of appending.
- Put detail where it lasts: a code comment for a constraint the code can't show, a commit message for the reasoning behind a change, the docs for usage.
