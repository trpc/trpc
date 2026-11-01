---
title: Try the codemod
description: 'Edit v11 code and watch `@trpc12/upgrade` rewrite it to v12 as you type, with the steps it leaves to you.'
section: Migrations
parent: migrations/from-v11
order: 5
experiment: codemod-playground
---

Paste or edit v11 code on the left; the right shows what [the codemod](./codemod.md) makes of it, rewritten on each change. Under both are the steps it leaves to you, as the CLI prints them: select one to put the cursor where it points.

```codemod-playground

```

Each tab starts from a sample: a server with `initTRPC` and a transformer, a client with `httpBatchLink`, `createTRPCContext` in React, and a fetch adapter with an `observable()` subscription. Your edits stay while you switch tabs, until you reset them.

It's the codemod itself, the `upgradeSource()` that `npx @trpc12/upgrade` runs on each file, running in your browser on Oxc's WebAssembly parser: nothing you type leaves the page. The file name above each pane is the one the codemod is told, so a `.tsx` file parses JSX.
