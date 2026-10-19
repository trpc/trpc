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
Where a reviewer can see this change: the docs pages it touches, and the example routes that show it.

- Deep-link this PR's Vercel preview. Exact page or route, plus an anchor when one heading is the point. Not the site root, and not the production site.
- Copy the base URL from the Vercel bot's comment after that project is Ready (the Preview column). Do not guess the hostname: the team suffix and the branch slug are not guessable, and a guess 404s.
  - The Next.js example is project `next-prisma-starter` (`examples/next-prisma-starter`). Routes look like `/` and `/post/<id>`.
  - The OG image service is project `og-image` (`www/og-image`). Routes are `/api/docs` and `/api/blog`, with the card's fields as JSON in `?input=`.
- The docs site (trpc.io, `www/docs`) has no preview. Link the changed file in this PR's diff instead.
- One bullet per page or route, with a link to it. Under it, one bullet per change on that page: a link to the section it's in, then what changed. A page with a single change can say it on the page's own line, after a colon.
- While a deploy is not Ready, write "pending" in place of the link, then replace it.
- Delete the placeholder bullets this change does not use. If none apply, replace the list with "None".

Example, once the bot has posted the previews:

- Docs: [`www/docs/client/links/httpBatchLink.md`](https://github.com/trpc/trpc/pull/<number>/files#diff-<hash>)
  - Options: new `maxItems` row.
  - Disabling request batching: example uses `splitLink`.
- Next.js: [Post](https://<next-prisma-starter preview>/post/1): the post loads with `useSuspenseQuery`.
-->

- <page or route>: pending
  - <section>: <what changed>

## Alternatives considered

<!--
Other ways to solve this, and why each lost: a different API, a smaller change, doing nothing, what oRPC does.
Where this differs from oRPC, say why.
Write "None" if there was only one sensible way.
-->

## Testing

<!-- How you checked it works: new or updated tests, manual runs. -->
