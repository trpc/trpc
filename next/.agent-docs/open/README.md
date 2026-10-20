# Open questions

Questions only a human can answer: API shapes, trade-offs and spikes waiting for a call. Each is one file, so parallel changes rarely touch the same one. Once answered, a question becomes a record in [`decisions/`](../decisions) and its file here is deleted.

The docs site renders this folder and `decisions/` for browsing at [`https://v12.trpc.io/v12/decisions`](https://v12.trpc.io/v12/decisions), each question at `/v12/decisions/open/<file name>`: the summary as its lead, each option as a tab (or side by side) with its code and its ✅ and ❌ bullets as pros and cons, the recommended one marked, spikes, PRs and previews as buttons, and `## Details` collapsed. Nothing on the site links there, and it's kept out of search engines, the sitemap, `llms.txt` and the site's search ([`decisions/hidden-decisions-pages.md`](../decisions/hidden-decisions-pages.md)). Relative links work there too: to an open question or a decision, they open its page; to any other file, it on GitHub.

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

```ts twoslash
// ---cut-start---
import { client } from './client.ts';
// ---cut-end---
// What a user writes under this option, compiled against v12 as it is
const post = await client.post.byId.query({ id: '1' });
//    ^?
```

- ✅ A pro
- ❌ A con

### B) Another option

```ts twoslash
// @errors: 2345
// ---cut-start---
import { createSafeClientB as createSafeClient } from '../open/safe-client-iteration.ts';
import { client } from './client.ts';
// ---cut-end---
// What a user writes under this option, compiled against its stub
```

## Recommendation

**B.** Why, in two or three sentences. Effect-native first, v11's way second ([`effect-native-by-default.md`](../decisions/effect-native-by-default.md)).

## Blocked until answered

- What can't be built, documented or released until this is answered. "Nothing" is a valid answer; say so.

## Details

Optional, for deep reading: measurements, edge cases, history. The site shows it collapsed.
````

- **Frontmatter:**
  - Quote a value that starts with a backtick or has a `: ` in it (``summary: '`call()` on a …'``); YAML can't read it otherwise.
  - `title`: the question, in plain words, ending with `?`, the same as the `#` heading.
  - `summary`: one line. It's the card on the site's index and the lead of the page.
  - `area`: one of `areas` in `tooling/decisions/open.ts`.
  - `recommended`: the letter of the recommended option.
  - `questions`: optional, the proposal questions (`Q24.4`) it covers.
  - `links`: what to read before answering, each with a `kind`: `spike`, `pr`, `preview`, `docs`, `decision`, `proposal`, `note`, `code` or `issue`. Spikes, PRs and previews come first; the site shows them as buttons. A relative `url` is a file in the repo, from this folder, and must exist.
- **Sections**, in this order: `## Why it matters`, `## Options`, `## Recommendation`, `## Blocked until answered`, then an optional `## Details`.
- **Options:** `### A) <title>`, `### B) <title>`, … in order, at least two. Each has a code block of what a user writes under it (config or a command when it isn't code), and at least one ✅ and one ❌ bullet. When "keep it as it is" is an option, make it A. For a before/after, put both in one block, with `// before` and `// after` comments. Don't add an "in your own words" option; the human can always answer that way.
- **Code compiles**, so the page shows each name's type on hover and an option can't misstate the API:
  - Write TypeScript as `ts twoslash` (`tsx twoslash` for JSX). A block is `src/block.twoslash.ts` in the `www/samples/decisions` app: it can import the app's `./server.ts` (a blog router whose procedures declare errors, stream and subscribe) and `./client.ts` (`client`, `safeClient`), or define its own. Hide that setup between `// ---cut-start---` and `// ---cut-end---`.
  - What exists today compiles against v12 as it is. What an option proposes comes from a stub, `www/samples/decisions/open/<this file's name>.ts`: types and `declare`s only, one export per option and name (`createSafeClientB`), imported under the real name behind the cut (`import { createSafeClientB as createSafeClient } from '../open/<file>.ts'`). Don't augment a package's types (`declare module`) in a stub; export what the option adds instead. Delete the stub with the open file.
  - Show what the choice changes: `// ^?` under a name pins its type (`const [posts, err]` then `//     ^?`), and `// @errors: 2345` at the top makes an expected error part of the example, with a `//` comment on the line before it saying why. Prefer an error that makes a point: a `matchError()` missing a handler fails to compile, so its error shows which codes a call can fail with.
  - Plain `ts` only for what can't compile: a fragment of a file, or a package the app doesn't install (add it to the app's `package.json` when several questions need it).
  - `pnpm --filter @trpc12/www decisions:check <file>` compiles one file's blocks (all of them without a file) and prints each error, in seconds once the cache is warm; the site's build fails on the same errors.
- Keep it short. A file is read to make a decision, not to learn the topic: link the spike, note or proposal for the background, and put long material under `## Details`.
- Write it like the rest of `.agent-docs/`: no human's name, plain words, every name in backticks, lists rather than tables.
