<!--
Write plainly, as Orwell would:
- Use short, common words. Cut any word you can.
- Prefer active voice. Avoid jargon and stock phrases.
- Use bullet points, not paragraphs.
-->

## Why

<!-- The problem or need behind this change. Link related issues if there are any. -->

## What

<!--
What changes, as bullet points.

If the public API changes, show it in code blocks: before and after, or a short usage example.
-->

## Links

<!--
Where a reviewer can see this change: the docs pages it touches.

- Deep-link this PR's Vercel preview. Exact page, plus an anchor when one heading is the point. Not the site root, and not the production site.
- Copy the base URL from the Vercel bot's comment after the project is Ready (the Preview column). Do not guess the hostname: the team suffix and the branch slug are not guessable, and a guess 404s.
  - The docs site is project `trpc-v12`. A page lives at `/v12/docs/<path>`, where `<path>` is its file under `next/docs/` without `.md`: `next/docs/client/links.md` is `/v12/docs/client/links`.
  - `trpc-v12` only builds previews for branches named `v12/<name>`. On any other branch, link the changed file in this PR's diff and say there is no preview.
- One bullet per page, with a link to the page. Under it, one bullet per change on that page: a link to the section it's in, then what changed. A page with a single change can say it on the page's own line, after a colon.
- While a deploy is not Ready, write "pending" in place of the link, then replace it.
- Delete the placeholder bullets this change does not use. If none apply, replace the list with "None".

Example, once the bot has posted the preview:

- [Custom links](https://<trpc-v12 preview>/v12/docs/client/custom-links)
  - [Call options](https://<trpc-v12 preview>/v12/docs/client/custom-links#call-options): `signal` is always set.
  - [Branching links](https://<trpc-v12 preview>/v12/docs/client/custom-links#branching-links): new example with `splitLink`.
- [Links](https://<trpc-v12 preview>/v12/docs/client/links#terminating-links): `httpLink` sends with `fetch`.
-->

- <page>: pending
  - <section>: <what changed>

## Alternatives considered

<!--
Other ways to solve this, and why each lost: a different API, a smaller change, doing nothing, what v11 or oRPC does.
Where this differs from v11 or oRPC, say why.
Write "None" if there was only one sensible way.
-->

## Testing

<!-- How you checked it works: new or updated tests, manual runs. -->
