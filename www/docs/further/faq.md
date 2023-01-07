---
id: faq
title: FAQ / Troubleshooting
sidebar_label: FAQ / Troubleshooting
slug: /faq
---

Collection of common problems and and ideas on how to troubleshoot & resolve them.

## It doesn't work! I'm getting `any` everywhere

- Make sure you have `"strict": true` in your `tsconfig.json`
- Make sure you have no type errors
- Make sure your `@trpc/*`-versions match in your `package.json`

## Is tRPC production ready?

Yes. tRPC is very stable and is used by thousands of companies, even big ones like [Netflix](https://netflix.com) & [Pleo](https://pleo.io) are using tRPC in production.

## Why doesn't tRPC doesn't work in my monorepo?

**Common pitfalls:**

- Make sure you have the same version of all `@trpc/*` across all your project
- Make sure you have `"strict": true` in all your `tsconfig.json`s
- Make sure you have no type errors in your app


> Related discussions and issues
>
> - ....


