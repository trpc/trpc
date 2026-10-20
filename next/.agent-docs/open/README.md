# Open questions

Questions only a human can answer: API shapes, trade-offs and spikes waiting for a call. Each is one file, so parallel changes rarely touch the same one. Once answered, a question becomes a record in [`decisions/`](../decisions) and its file here is deleted.

The docs site renders this folder and `decisions/` at a hidden path for browsing: each option as a tab with its code, the recommended one marked, and the links as buttons. Nothing on the site links there, and it's kept out of search engines, the sitemap, `llms.txt` and the site's search. Find the path in `www/src/site.ts` (`decisions`).

## When to add one

- A choice that needs a human: it reverses a `(human)` decision, changes a public API's shape, or has real trade-offs either way. A spike or draft PR waiting for a verdict always gets one.
- Not for a manual task (deleting branches, adding a secret), and not for something an `(agent)` call can settle: make the call and record it in `decisions/`.
- Before adding one, look for a file on the same choice (`pnpm decisions --pending`) and extend it instead.
- Each `Open (human):` bullet in a decision, and each proposal question (`Qn.m`) that only `(agent)` decisions cite, should have a file here. Cite the question number in the file.

## Lifecycle

1. **Asked:** add `open/<topic>.md`, named by topic in kebab-case, from the template below.
2. **Answered** (in a decision round or in chat): record it in `decisions/` as [`README.md#decisions`](../README.md#decisions) says, quoting the human. Copy what still matters (the options given up, their cost) into the record's **Lost** bullet, then delete the open file in the same commit, with its implementation.
3. **Changed:** a new spike, PR or preview edits the file. A question that goes away without an answer (the code changed under it) is deleted, saying why in the commit message.

`tooling/decisions/open.ts` checks the format (`tooling/decisions/open.test.ts`), and the site's build fails on a file it can't read.

## Template

````md
---
title: Should `createSafeClient` make iteration safe on its own?
summary: One line, under 160 characters, that says what changes for a user.
area: errors
recommended: B
questions: [Q24.4]
links:
  - kind: pr
    label: 'Draft PR #7711'
    url: https://github.com/trpc/trpc/pull/7711
  - kind: decision
    label: streamed-output-errors
    url: ../decisions/streamed-output-errors.md
---

# Should `createSafeClient` make iteration safe on its own?

## Why it matters

Two to four sentences: what exists today, who runs into it and what it costs them.

## Options

### A) Keep it as it is

One or two sentences on what this option means.

```ts
// What a user writes under this option
```

- ✅ A pro
- ❌ A con

### B) Another option

…

## Recommendation

**B.** Why, in two or three sentences. Effect-native first, v11's way second ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)).

## Blocked until answered

- What can't be built, documented or released until this is answered. "Nothing" is a valid answer; say so.

## Details

Optional, for deep reading: measurements, edge cases, history. The site shows it collapsed.
````

- **Frontmatter:**
  - `title`: the question, in plain words, ending with `?`, the same as the `#` heading.
  - `summary`: one line. It's the card on the site's index and the lead of the page.
  - `area`: one of `areas` in `tooling/decisions/open.ts`.
  - `recommended`: the letter of the recommended option.
  - `questions`: optional, the proposal questions (`Q24.4`) it covers.
  - `links`: what to read before answering, each with a `kind`: `spike`, `pr`, `preview`, `docs`, `decision`, `proposal`, `note`, `code` or `issue`. Spikes, PRs and previews come first; the site shows them as buttons. A relative `url` is a file in the repo, from this folder, and must exist.
- **Sections**, in this order: `## Why it matters`, `## Options`, `## Recommendation`, `## Blocked until answered`, then an optional `## Details`.
- **Options:** `### A) <title>`, `### B) <title>`, … in order, at least two. Each has a code block of what a user writes under it (config or a command when it isn't code), and at least one ✅ and one ❌ bullet. When "keep it as it is" is an option, make it A. For a before/after, put both in one block, with `// before` and `// after` comments. Don't add an "in your own words" option; the human can always answer that way.
- Keep it short. A file is read to make a decision, not to learn the topic: link the spike, note or proposal for the background, and put long material under `## Details`.
- Write it like the rest of `.agent-docs/`: no human's name, plain words, every name in backticks, lists rather than tables.
