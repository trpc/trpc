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
- The base URL follows from the branch name, so write the links when you open the PR: `https://<project>-git-<branch slug>-trpc.vercel.app`. The slug is the branch lowercased, with `.` dropped and other runs of non-alphanumerics turned into `-`: `fix/foo.bar` is `fix-foobar`. From a fork, the branch part is `fork-<owner>-<branch>`. Run `pnpm preview-urls` to print each project's URL for the current branch: it also handles names over 63 characters, which Vercel cuts and suffixes with a hash.
  - Docs (trpc.io) is project `www`. A page lives at `/docs/<path>`, where `<path>` is its file under `www/docs/` without `.md`: `www/docs/client/links/httpBatchLink.md` is `/docs/client/links/httpBatchLink`.
  - The Next.js App Router example is `trpc-next-app-dir` (`examples/.experimental/next-app-dir`). Routes look like `/posts`, `/posts/<id>` and `/server-action`.
  - The Next.js Pages Router example is `next-prisma-starter` (`examples/next-prisma-starter`). Routes look like `/` and `/post/<id>`.
  - The WebSockets example is `next-prisma-websockets-starter` (`examples/next-prisma-websockets-starter`).
  - The TanStack Start SSE chat example is `next-sse-chat` (`examples/tanstack-start-sse-chat`).
  - The TodoMVC example is `examples-todomvc` (`examples/next-prisma-todomvc`). Routes are `/all`, `/active` and `/completed`.
  - The OG image service is `og-image` (`www/og-image`). Routes are `/api/docs` and `/api/blog`, with the card's fields as JSON in `?input=`.
- When a project builds no preview for this PR, say so, link each page's file in this PR's diff (`https://github.com/trpc/trpc/pull/<number>/files#diff-<sha256 of the path>`), and name its sections without links.
- One bullet per page or route, with a link to it. Under it, one bullet per change on that page: a link to the section it's in, then what changed. A page with a single change can say it on the page's own line, after a colon.
- Delete the placeholder bullets this change does not use. If none apply, replace the list with "None".

Example, for branch `feat/batch-max-items`:

- Docs: [HTTP Batch Link](https://www-git-feat-batch-max-items-trpc.vercel.app/docs/client/links/httpBatchLink)
  - [Options](https://www-git-feat-batch-max-items-trpc.vercel.app/docs/client/links/httpBatchLink#options): new `maxItems` row.
  - [Disabling request batching](https://www-git-feat-batch-max-items-trpc.vercel.app/docs/client/links/httpBatchLink#disabling-request-batching): example uses `splitLink`.
- Next.js App Router: [Post](https://trpc-next-app-dir-git-feat-batch-max-items-trpc.vercel.app/posts/1): the post loads with `useSuspenseQuery`.
-->

- [<page or route>](<preview URL>)
  - [<section>](<preview URL>#<anchor>): <what changed>

## Alternatives considered

<!--
Other ways to solve this, and why each lost: a different API, a smaller change, doing nothing, what oRPC does.
Where this differs from oRPC, say why.
Write "None" if there was only one sensible way.
-->

## Testing

<!-- How you checked it works: new or updated tests, manual runs. -->
