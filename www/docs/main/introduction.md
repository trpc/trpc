---
id: introduction
title: tRPC
sidebar_label: Introduction
slug: /
author: Alex / KATT 🐱
author_url: https://twitter.com/alexdotjs
author_image_url: https://avatars1.githubusercontent.com/u/459267?s=460&v=4
---

<div align="center">
  <img src="/img/logo-text.png" alt="tRPC" height="150" />
  <p>End-to-end typesafe APIs made easy</p>
  <p>
    <a href="https://codecov.io/gh/trpc/trpc">
      <img src="https://codecov.io/gh/trpc/trpc/branch/main/graph/badge.svg?token=KPPS918B0G" alt="codecov" />
    </a> <a href="https://github.com/trpc/trpc">
      <img src="https://img.shields.io/github/license/trpc/trpc.svg?label=license&style=flat" alt="GitHub License"/>
    </a> <a href="https://github.com/trpc/trpc">
      <img src="https://img.shields.io/github/stars/trpc/trpc.svg?label=🌟%20stars&style=flat" alt="GitHub Stars"/>
    </a>
  </p>

  <h2>Watch Video</h2>
  <figure>
    <iframe src="https://www.youtube.com/embed/qBXrwFsFK1Q?start=433" title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen style={{maxWidth: '100%', width: '560px', height: '315px'}}></iframe>
    <figcaption style={{ fontSize: '0.7rem' }}><a href="https://twitter.com/alexdotjs">alexdotjs / KATT</a> presenting at Prisma's TypeScript meetup. Skipped to 7:13 where the coding begins.</figcaption>
  </figure>
</div>

## Introduction

tRPC is a framework for building **typesafe** APIs with TypeScript — and there's no code generation required.

As TypeScript and static typing increasingly becomes a best practice in web programming, the API presents a major pain point. We need better ways to **statically type** our API endpoints and **share those types** between our client and server.

### An alternative to traditional REST or GraphQL

Currently GraphQL is the dominant way to implement typesafe APIs in TypeScript (and it's amazing!). Since GraphQL is designed as a language-agnostic specification for implementing APIs, it doesn't take full advantage of the power of a language like TypeScript - [further reading](../further/further-reading.md#relationship-to-graphql). 

If your project is built with full-stack TypeScript, you can share types **directly** between your client and server, without relying on code generation.

## Introducing tRPC

We set out to build a simpler library for building typesafe APIs that leverages the full power of modern TypeScript. Introducing tRPC! Featuring:

- 🧙‍♂️&nbsp; Full static typesafety & autocompletion on the client
- 🐎&nbsp; Snappy DX. No code generation, run-time bloat, or build pipeline.
- 🍃&nbsp; Light. tRPC has zero deps and a tiny client-side footprint.
- 🐻&nbsp; Easy to add to your existing brownfield project.
- 🔋&nbsp; Batteries included. React-library + Next.js/Express adapters. _(But tRPC is not tied to React - [reach out](https://twitter.com/alexdotjs) if you want to make a Svelte/Vue/... lib)_
- 🥃&nbsp; Simple to use APIs for queries & mutations + experimental subscriptions support.
- 👀&nbsp; Quite a few [Example Apps](example-apps.md) that you can use for reference or as a starting point.
- ✅&nbsp; Well-tested & running in production.
