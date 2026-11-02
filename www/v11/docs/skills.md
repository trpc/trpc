---
id: skills
title: Agent Skills
sidebar_label: Agent Skills
slug: /skills
description: Set up and use TanStack Intent to provide AI agent skills for tRPC
section: "tRPC"
order: 1.5
---

tRPC ships [TanStack Intent](https://tanstack.com/intent/latest/docs/getting-started/quick-start-consumers) skills to help AI coding agents work with tRPC. When your agent works on a task that matches a skill, it loads the skill's `SKILL.md` into context.

The skills ship inside `@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`, `@trpc/next` and `@trpc/openapi`, so they're already in your `node_modules`.

## Setup

### 1. Run install

The `install` command adds skill-loading guidance to your agent's config file (`AGENTS.md`, `CLAUDE.md`, etc.):

```bash
npx @tanstack/intent@latest install
```

It covers the skills shipped in tRPC and your other installed packages.

### 2. Use skills in your workflow

When your agent works on a task that matches a skill, it loads the corresponding `SKILL.md` into context to guide implementation.

To see which skills are available:

```bash
npx @tanstack/intent@latest list
```

To load one yourself, for example the server auth skill:

```bash
npx @tanstack/intent@latest load @trpc/server#auth
```

### 3. Keep skills up-to-date

Skills version with library releases. When you update tRPC (e.g. `npm update @trpc/server`), you get the skills that match your installed version.

## Learn more

For full documentation on TanStack Intent, see the [Quick Start for Consumers](https://tanstack.com/intent/latest/docs/getting-started/quick-start-consumers) guide.
