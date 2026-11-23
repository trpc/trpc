<!--
Write plainly, as Orwell would:
- Use short, common words. Cut any word you can.
- Prefer active voice. Avoid jargon and stock phrases.
- Use bullet points, not paragraphs.
Keep it under 200 words, not counting code blocks and links. Put detail in code comments, commit messages or docs. See AGENTS.md.
Keep credits: `Co-authored-by:` lines, contributor credit and AI disclosures. Drop thank-you notes and review history.
-->

## Why

<!--
The problem, in a line or two.
Then each closing keyword on its own bullet, never several issues on one line:
- Closes #123
-->

## What

<!--
Up to five bullets on what changes, not a file-by-file list.
If the public API changes, show it in a short code block: before and after, or a usage example.
-->

## Links

<!--
One bullet per docs page or example route this changes, linking this PR's Vercel preview, never trpc.io: `[Page › Section](<preview URL>/docs/<path>#<anchor>): what changed`.
The preview URL comes from the branch name, so you can write it before Vercel builds: run `pnpm preview-urls` on the branch (or `pnpm preview-urls <branch> [fork-owner]`) and use its `www` line for docs. Write the links when you open the PR, not "pending" or "to follow". `www/v11/docs/<path>.md` is at `/docs/<path>`.
If a project builds no preview, say so and link the page's file in this PR's diff instead.
Write "None" if no page or route changes.
-->

## Alternatives considered

<!-- One line each: another way to solve this, such as what oRPC does, and why it lost. Write "None" if there was only one sensible way. -->

## Testing

<!-- The regression check: the test that fails without this change, in one line. Or how you checked it by hand. Don't list every test you ran; CI shows that. -->

## AI model

<!-- The AI model that wrote or helped with this change, with its effort level if it has one: "Claude Opus 5.5 High". Write "None" if you used none. -->
