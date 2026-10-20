---
title: "Announcing tRPC v10"
description: "tRPC provides a great developer experience by enforcing tight, full-stack type bindings through the power of TypeScript. No API contract drift, no code generation."
date: "2022-11-21"
authors: [{"image":"https://github.com/KATT.png","name":"Alex / KATT 🐱","title":"Creator of tRPC","url":"https://x.com/alexdotjs"}]
---

tRPC provides a great developer experience by enforcing tight, full-stack type bindings through the power of TypeScript. No API contract drift, no code generation.

Since our last major version release in August 2021, the tRPC community has seen substantial growth:

- We now have over [15,000 stars on GitHub](https://github.com/trpc/trpc)
- [A Discord community](https://trpc.io/discord) with over 2,000 members
- [100k+ weekly npm downloads](https://www.npmjs.com/package/@trpc/server)
- [Nearly 200 contributors](https://github.com/trpc/trpc/graphs/contributors)
- [A growing ecosystem of extensions, examples, and content](/docs/community/awesome-trpc)

**Today, we're launching tRPC v10**. We're excited to share that v10 is already being used in production by many large TypeScript projects. This official release announces general availability to the wider community.

For new projects, you can get up and running with an [example application](/docs/community/awesome-trpc#-starting-points-example-projects-etc) to learn about tRPC v10. For projects that were already enjoying tRPC v9, [visit the v10 migration guide](/v10/docs/migrate-from-v9-to-v10).

## Overview of changes

v10 is tRPC's biggest release ever. This is the first time we've made any fundamental changes to the structure of tRPC and we believe these changes unlock new possibilities for fast-moving teams working on cutting edge applications.

### Improved developer experience

tRPC v10 embraces your IDE. We want to unify your types - but we've also brought together your frontend, backend, and editing experience in this version.

With v10, you can:

- Use _"Go to Definition"_ to jump straight from your frontend consumer to your backend procedure
- Use _"Rename Symbol"_ to give a new name to an input argument or procedure across your whole application
- [Infer types more easily](https://trpc.io/docs/v10/infer-types) for when you'd like to use your tRPC types in your application manually

### Powerful backend framework

In v10, we've revisited the syntax for how you define your backend procedures, opening up more opportunities to bring in your desired logic in healthy ways. This version of tRPC features:

- [Reusable middlewares](https://trpc.io/docs/v10/middlewares) with [Context Extension](https://trpc.io/docs/v10/middlewares#context-extension)
- [Chainable & reusable procedures](https://trpc.io/docs/v10/procedures#reusable-base-publicprocedures) with the ability to use [multiple input parsers](https://trpc.io/docs/v10/procedures#multiple-input-parsers)
- Flexible [error handling](https://trpc.io/docs/v10/error-handling) with [custom error formatting](https://trpc.io/docs/v10/error-formatting)
- [Procedure metadata](https://trpc.io/docs/v10/metadata) to decorate your procedures with more information

### Massively improved TypeScript performance

TypeScript enables developers to do incredible things - but it can come at a cost. Many of the techniques we use to keep your types tight are heavy work on the TypeScript compiler. We heard community feedback that the largest applications using tRPC v9 were beginning to suffer from decreased performance in developers' IDEs as a result of this compiler pressure.

Our goal is to enhance the developer experience for applications of all sizes. In v10, we've dramatically improved TypeScript performance (especially with TS incremental compilation) so that your editor stays snappy.

## Incremental migration

We've also put in a lot of work to make the migration experience as straightforward as possible, including an `interop()` method that allows (almost) full backward compatibility with v9 routers. [Visit the migration guide](/v10/docs/migrate-from-v9-to-v10) for more information.

[Sachin](https://twitter.com/s4chinraja) from the core team has also made [a codemod](https://github.com/sachinraja/trpc-v10-migrate-codemod) that can do much of the heavy lifting of the migration for you.

## A growing ecosystem

A rich set of sub-libraries is continuing to form around tRPC. Here are a few examples:

- [trpc-openapi](https://github.com/jlalmes/trpc-openapi) to easily create REST-compatible endpoints
- [create-t3-app](https://github.com/t3-oss/create-t3-app) to bootstrap a full-stack Next.js application with tRPC
- [create-t3-turbo](https://github.com/t3-oss/create-t3-turbo) to kickstart your next React Native app with tRPC
- [trpc-chrome](https://github.com/jlalmes/trpc-chrome) for building Chrome extensions using tRPC
- Adapters for frameworks like [Solid](https://github.com/OrJDev/solid-trpc), [Svelte](https://github.com/icflorescu/trpc-sveltekit-example), and [Vue](https://github.com/michealroberts/usetrpc)

For more plugins, examples, and adapters, [visit the Awesome tRPC collection](/docs/community/awesome-trpc).

## Thank you!

The core team and I want you to know: we're just getting started. We're already busy experimenting with [React Server Components](https://github.com/reactjs/rfcs/pull/229) and Next.js 13.

I also want to give a huuuge shoutout to [Sachin](https://twitter.com/s4chinraja), [Julius](https://twitter.com/jullerino), [James](https://twitter.com/jlalmes), [Ahmed](https://twitter.com/ixahmedxii), [Chris](https://twitter.com/trashh_dev), [Theo](https://twitter.com/theo), [Anthony](https://twitter.com/shewDev), and [all the contributors who helped make this release possible](https://github.com/trpc/trpc#all-contributors).

Thanks for using and supporting tRPC.

---

- Follow [@trpcio](https://twitter.com/trpcio) on Twitter.
- Join our [Discord-community](https://trpc.io/discord)
- [Try out tRPC in your browser](https://trpc.io/#try-it-out)

<a
      id="sponsor-button"
      href="/sponsor"
      class="group flex h-12 w-max items-center gap-4 rounded-lg border-2 bg-zinc-200 px-4 py-2 transition hover:bg-zinc-100 dark:border-zinc-900 dark:bg-zinc-800 hover:dark:border-zinc-700 hover:dark:bg-zinc-900"
    >
      <svg
        role="img"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        class="aspect-square h-6 fill-pink-500 transition-transform duration-200 ease-in group-hover:scale-110"
      >
        <path d="M17.625 1.499c-2.32 0-4.354 1.203-5.625 3.03-1.271-1.827-3.305-3.03-5.625-3.03C3.129 1.499 0 4.253 0 8.249c0 4.275 3.068 7.847 5.828 10.227a33.14 33.14 0 0 0 5.616 3.876l.028.017.008.003-.001.003c.163.085.342.126.521.125.179.001.358-.041.521-.125l-.001-.003.008-.003.028-.017a33.14 33.14 0 0 0 5.616-3.876C20.932 16.096 24 12.524 24 8.249c0-3.996-3.129-6.75-6.375-6.75zm-.919 15.275a30.766 30.766 0 0 1-4.703 3.316l-.004-.002-.004.002a30.955 30.955 0 0 1-4.703-3.316c-2.677-2.307-5.047-5.298-5.047-8.523 0-2.754 2.121-4.5 4.125-4.5 2.06 0 3.914 1.479 4.544 3.684.143.495.596.797 1.086.796.49.001.943-.302 1.085-.796.63-2.205 2.484-3.684 4.544-3.684 2.004 0 4.125 1.746 4.125 4.5 0 3.225-2.37 6.216-5.048 8.523z" />
      </svg>
      <span class="font-semibold text-zinc-900 no-underline dark:text-zinc-300">
        Become a Sponsor!
      </span>
    </a>
