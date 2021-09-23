---
id: introduction
sidebar_label: Introduction
layout: ../../layouts/MainLayout.astro
---

## Introduction

<abbr title="TypeScript Remote Procedure Call">tRPC</abbr> allows you to easily build & consume fully typesafe APIs, without schemas or code generation.

As TypeScript and static typing increasingly becomes a best practice in web programming, the API presents a major pain point. We need better ways to **statically type** our API endpoints and **share those types** between our client and server (or server-to-server).

### An alternative to traditional REST or GraphQL

Currently GraphQL is the dominant way to implement typesafe APIs in TypeScript (and it's amazing!). Since GraphQL is designed as a language-agnostic specification for implementing APIs, it doesn't take full advantage of the power of a language like TypeScript - [further reading](../further/further-reading.md#relationship-to-graphql).

If your project is built with full-stack TypeScript, you can share types **directly** between your client and server, without relying on code generation.

## Introducing tRPC

We set out to build a simple library for building typesafe APIs that leverages the full power of modern TypeScript. Introducing tRPC! Featuring:

- 🧙‍♂️&nbsp; Full static typesafety & autocompletion on the client - on request inputs, outputs, & errors.
- 🐎&nbsp; Snappy DX. No code generation, runtime bloat, or build pipeline.
- 🍃&nbsp; Light. tRPC has zero deps and a tiny client-side footprint.
- 🐻&nbsp; Easy to add to your existing brownfield project.
- 🔋&nbsp; Batteries included. React-library + Next.js/Express adapters. _(But tRPC is not tied to React - [reach out](https://twitter.com/alexdotjs) if you want to make a Svelte/Vue/... lib)_
- 🥃&nbsp; Simple to use APIs for queries, mutations, & subscriptions support.
- ⚡️&nbsp; Request batching - requests made at the same time can be automatically combined

... and

- 👀&nbsp; Quite a few [Example Apps](example-apps.md) that you can use for reference or as a starting point.
- ✅&nbsp; Well-tested & running in production.
