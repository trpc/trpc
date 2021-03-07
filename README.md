<div align="center">
  <h1 align="center">
    <img src="./www/static/img/logo-text.png" alt="tRPC" height="100" />
  </h1>
  <p>a toolkit for building end-to-end typesafe data layers</p>
  <p>
    <a href="https://codecov.io/gh/trpc/trpc">
      <img src="https://codecov.io/gh/trpc/trpc/branch/main/graph/badge.svg?token=KPPS918B0G" alt="codecov">
    </a>
  </p>
  <p>
    <figure>
      <img src="https://storage.googleapis.com/trpc/trpcgif.gif" alt="Server/client example" />
      <figcaption>
        The client above is <strong>not</strong> importing any code from the server, only it's type declarations.
        <br/>
        <sub><sup><em><a href="https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export">Import type only imports declarations to be used for type annotations and declarations. It always gets fully erased, so there’s no remnant of it at runtime.</a></em></sup></sub>
      </figcaption>
    </figure>
  </p>
</div>

# Intro

tRPC is a framework for building strongly typed RPC APIs with TypeScript. Alternatively, you can think of it as a way to avoid APIs altogether. 

- 🧙‍♂️&nbsp; Automatic type-safety & autocompletion inferred from your API-paths, their input data, outputs, & errors.
- 🐎&nbsp; Snappy DX. No code generation, run-time bloat, or build pipeline.
- 🍃&nbsp; Light. tRPC has zero deps and a tiny client-side footprint.
- 🐻&nbsp; Easy to add to your existing brownfield project.
- 🔋&nbsp; Batteries included. React-library + Next.js/Express adapters. _(But tRPC is not tied to React - [reach out](https://twitter.com/alexdotjs) if you want to make a Svelte/Vue/... lib)_
- 🥃&nbsp; Simple to use APIs for queries & mutations + experimental subscriptions support.
- 👀&nbsp; Quite a few examples in the [./examples](./examples)-folder
- ✅&nbsp; Well-tested & running in production.

> _tRPC requires TypeScript > 4.1 because of [Template Literal Types](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html), but you can get some benefits with autocompletion etc even if you use raw JS._

---

- [Intro](#intro)
- [Usage](#usage)
- [Example apps](#example-apps)
- [Development workflow](#development-workflow)
  - [Testing](#testing)
- [Contributors ✨](#contributors-)


# Usage

> **👉  See documentation on [trpc.io](https://trpc.io/docs). 👈**


**Quick start:**

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-hello-world my-app
```

# Example apps

| URL                                                | Command                   | Path                                                               | Description                                                                                            |
| -------------------------------------------------- | ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [todomvc.trpc.io](https://todomvc.trpc.io)         | `yarn example:todomvc`    | [`./examples/next-prisma-todomvc`](./examples/next-prisma-todomvc) | TodoMVC-example with SSG & Prisma. [Playwright](https://playwright.dev) for E2E-testing                |
| [chat.trpc.io](https://chat.trpc.io)               | `yarn example:chat`       | [`./examples/next-ssg-chat`](./examples/next-ssg-chat)             | Next.js real-time chat example with SSG & Prisma. [Playwright](https://playwright.dev) for E2E-testing |
| [hello-world.trpc.io](https://hello-world.trpc.io) | `yarn example:hello`      | [`./examples/next-hello-world`](./examples/next-hello-world)       | Minimal Next.js example. [Playwright](https://playwright.dev) for E2E-testing                          |
| _n/a_                                              | `yarn example:standalone` | [`./examples/standalone-server`](./examples/standalone-server)     | Standalone tRPC server + node client                                                                   |
| _n/a_                                              | `yarn example:playground` | [`./examples/playground`](./examples/playground)                   | Express server + node client                                                                           |


# Development workflow

```bash
git clone git@github.com:trpc/trpc.git
cd trpc
yarn
```

In one terminal, run tsdx watch in parallel:

```bash
yarn dev
```

This builds each package to `<packages>/<package>/dist` and runs the project in watch mode so any edits you save inside `<packages>/<package>/src` cause a rebuild to `<packages>/<package>/dist`. The results will stream to to the terminal.

## Testing

> [![codecov](https://codecov.io/gh/trpc/trpc/branch/main/graph/badge.svg?token=KPPS918B0G)](https://codecov.io/gh/trpc/trpc) 
> 
> Some things regarding subscriptions is excluded in the coverage as it's an experimental feature

Testing is currently coalesced in [./packages/server/test](./packages/server/test) - we import the different libs from here, this makes it easier for us to do integration testing + getting test coverage on the whole codebase.

# Contributors ✨

Original [`0.x`](https://github.com/trpc/trpc/tree/v0.x)-version was created by [colinhacks](https://github.com/colinhacks) and `>1.x` was created by [KATT](https://twitter.com/alexdotjs).

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tr>
    <td align="center"><a href="https://twitter.com/alexdotjs"><img src="https://avatars.githubusercontent.com/u/459267?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alex Johansson</b></sub></a><br /><a href="#ideas-KATT" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Documentation">📖</a> <a href="#example-KATT" title="Examples">💡</a> <a href="#maintenance-KATT" title="Maintenance">🚧</a></td>
    <td align="center"><a href="https://colinhacks.com/"><img src="https://avatars.githubusercontent.com/u/3084745?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Colin McDonnell</b></sub></a><br /><a href="#ideas-colinhacks" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Documentation">📖</a></td>
    <td align="center"><a href="https://pieter.venter.pro"><img src="https://avatars.githubusercontent.com/u/1845861?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Pieter Venter</b></sub></a><br /><a href="#ideas-cyrus-za" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Acyrus-za" title="Reviewed Pull Requests">👀</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->



---

[![Powered by Vercel](./images/powered-by-vercel.svg "Powered by Vercel")](https://vercel.com/?utm_source=trpc&utm_campaign=oss)
