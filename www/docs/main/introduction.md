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
  <p>a toolkit for building end-to-end typesafe data layers</p>
  <p>
    <a href="https://codecov.io/gh/trpc/trpc">
      <img src="https://codecov.io/gh/trpc/trpc/branch/main/graph/badge.svg?token=KPPS918B0G" alt="codecov" />
    </a> <a href="https://github.com/trpc/trpc">
      <img src="https://img.shields.io/github/license/trpc/trpc.svg?label=license&style=flat" alt="GitHub License"/>
    </a> <a href="https://github.com/trpc/trpc">
      <img src="https://img.shields.io/github/stars/trpc/trpc.svg?label=🌟%20stars&style=flat" alt="GitHub Stars"/>
    </a>
  </p>
  <p>
    <figure>
      <img src="https://storage.googleapis.com/trpc/trpcgif.gif" alt="Server/client example" />
      <figcaption>
        The client above is <strong>not</strong> importing any code from the server, only it's type declarations.
        <br/>
        <small><em><a href="https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export">Import type only imports declarations to be used for type annotations and declarations. It always gets fully erased, so there’s no remnant of it at runtime.</a></em></small>
      </figcaption>
    </figure>
  </p>
</div>

## Introduction

tRPC is a framework for building strongly typed RPC APIs with TypeScript. Alternatively, you can think of it as a way to avoid APIs altogether. 

- 🧙‍♂️&nbsp; Automatic type-safety & autocompletion inferred from your API-paths, their input data, & outputs.
- 🐎&nbsp; Snappy DX. No code generation, run-time bloat, or build pipeline.
- 🍃&nbsp; Light. tRPC has zero deps and a tiny client-side footprint.
- 🐻&nbsp; Easy to add to your existing brownfield project.
- 🔋&nbsp; Batteries included. React-library + Next.js/Express adapters. _(But tRPC is not tied to React - [reach out](https://twitter.com/alexdotjs) if you want to make a Svelte/Vue/... lib)_
- 🥃&nbsp; Simple to use APIs for queries & mutations + experimental subscriptions support.
- 👀&nbsp; Quite a few examples in the [./examples](https://github.com/trpc/trpc/tree/main/examples)-folder


### Requirements

- tRPC requires TypeScript > 4.1 because of [Template Literal Types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html), but you can get some benefits with autocompletion etc even if you use raw JS.

