---
title: Should experiments' pages stay in `llms.txt` and `llms-full.txt`, next to the reviewed pages?
summary: Agents get the 32 hidden experiment pages in `llms.txt` (marked) and in full in `llms-full.txt`; they could move to its Optional section, or out.
area: docs-site
recommended: B
links:
  - kind: decision
    label: docs-experiments
    url: ../decisions/docs-experiments.md
  - kind: decision
    label: site-noindex-until-trpc-io
    url: ../decisions/site-noindex-until-trpc-io.md
  - kind: code
    label: llmsTxt (www/build/content.ts)
    url: ../../www/build/content.ts
  - kind: docs
    label: llms.txt on v12.trpc.io
    url: https://v12.trpc.io/llms.txt
---

# Should experiments' pages stay in `llms.txt` and `llms-full.txt`, next to the reviewed pages?

## Why it matters

The human hid the unreviewed pages because "its overwhelming to know what to use and not", and on 2026-10-20 said "experimental pages should be hdiden from seo but we should still show them in search". Today they're off the sidebar, sitemap and search engines, and in the site's search with a flask. For agents, an `(agent)` call lists them in `llms.txt` among the reviewed pages, each line starting "Experimental.", and puts their full text in `llms-full.txt`: 32 of 87 pages, about 133 kB of its 344 kB. An agent writing a user's code reads them like any other page.

## Options

### A) Keep it as it is: listed in place, marked

```md
## Middleware

- [Overview](https://v12.trpc.io/v12/docs/middleware/overview.md): …
- [Rate limiting](https://v12.trpc.io/v12/docs/middleware/rate-limit.md): Experimental. experimental_rateLimit() counts calls …
```

- ✅ An agent asked about a feature reaches its page and sees where it stands, as the site's search does for people
- ❌ An agent that reads the whole `llms-full.txt` gets every experiment's API as context, about two fifths of the file
- ❌ Agents see more than people browsing do, which is what hiding was for

### B) Under `llms.txt`'s Optional section, and out of `llms-full.txt`

The llms.txt format's `## Optional` section is for links an agent can skip; the experiments go there, grouped by experiment.

```md
## Middleware

- [Overview](https://v12.trpc.io/v12/docs/middleware/overview.md): …

## Optional

- [Full documentation](https://v12.trpc.io/llms-full.txt): every page above in one file
- [Rate limiting](https://v12.trpc.io/v12/docs/middleware/rate-limit.md): Experimental (Rate limits, locks and durable calls). …
```

- ✅ Like the site's search: findable when asked for, but not part of what an agent reads by default
- ✅ `llms-full.txt` holds only reviewed pages
- ❌ An agent that loads only `llms-full.txt` doesn't know the experiments exist

### C) Out of both

Experiments' `.md` pages stay at their URLs, but no agent file lists them.

```md
## Middleware

- [Overview](https://v12.trpc.io/v12/docs/middleware/overview.md): …
```

- ✅ Agents see what people browsing see, the strictest reading of "hide"
- ❌ An agent asked about rate limits or OpenAPI can't find the pages that document them, though people can through search

## Recommendation

**B.** It treats agents the way the human's latest answer treats people: hidden by default, found on request. The line still names the experiment and its risk, and nothing is lost from the site.

## Blocked until answered

- Nothing. The change is in `llmsTxt` and `agentFiles` in `www/build/content.ts`.

## Details

- Counted on the live `https://v12.trpc.io/llms.txt` and its pages' `.md` files on 2026-10-20.
- Each experiment's markdown already says, under its description, that it "might change or go away in any release", whichever option is picked.
- The listing was decided with the 2026-10-19 answer that indexing experiments was fine, and kept when the 2026-10-20 answer took that back ([docs-experiments](../decisions/docs-experiments.md)).
