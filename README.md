<div align="center">
  <h1 align="center">
    <img src="./www/static/img/logo-text.png" alt="tRPC" height="100" />
  </h1>
  <p>End-to-end typesafe APIs made easy</p>
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

- 🧙‍♂️&nbsp; Automatic typesafety & autocompletion inferred from your API-paths, their input data, outputs, & errors.
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
- [Contributing / Development workflow](#contributing--development-workflow)
  - [Hacking around with it](#hacking-around-with-it)
  - [Testing](#testing)
- [Contributors ✨](#contributors-)


# Usage

> **👉  See documentation on [trpc.io](https://trpc.io/docs). 👈**


**Quick start:**

```bash
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

# Example apps

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>URL</th>
      <th>Links</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        Next.js starter with Prisma, E2E testing, &amp; ESLint
        <br/><br/>
        <details>
          <summary>Quick start with <code>create-next-app</code></summary>
          <code>npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter</code>
        </details>
      </td>
      <td><em>n/a</em></td>
      <td>
        <ul>
          <li><a href="https://codesandbox.io/s/github/trpc/trpc/tree/main/examples/next-prisma-starter?file=/src/pages/index.tsx">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/next-prisma-starter">Source</a></li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>
        Next.js TodoMVC-example with SSG & Prisma.
        <br/><br/>
        <details>
          <summary>Quick start with <code>create-next-app</code></summary>
          <code>npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-todomvc trpc-todo</code>
        </details>
      </td>
      <td><a href="https://todomvc.trpc.io">todomvc.trpc.io</a></td>
      <td>
        <ul>
          <li><a href="https://codesandbox.io/s/github/trpc/trpc/tree/main/examples/next-prisma-todomvc?file=/pages/%5Bfilter%5D.tsx">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/next-prisma-todomvc">Source</a></li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>Vanilla standalone server &amp; procedure calls with node.js</td>
      <td><em>n/a</em></td>
      <td>
        <ul>
          <li><a href="https://githubbox.com/trpc/trpc/tree/main/examples/standalone-server">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/standalone-server">Source</a></li>
        </ul>
      </td>
    </tr>
    <tr>
      <td>Express server &amp; procedure calls with node.js.<br/>Uses experimental subscriptions.</td>
      <td><em>n/a</em></td>
      <td>
        <ul>
          <li><a href="https://githubbox.com/trpc/trpc/tree/main/examples/express-server">CodeSandbox</a></li>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/express-server">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

# Contributing / Development workflow

```bash
git clone git@github.com:trpc/trpc.git
cd trpc
yarn
```

## Hacking around with it


In one terminal, will run `preconstruct watch` in parallel which builds all `packages/*` on change:

```bash
yarn dev
```

In another terminal, you can for instance navigate to `examples/next-prisma-starter` and run `yarn dev` & it will update whenever code is changed in the packages.

## Testing

```bash
yarn test --watch
```

Testing is currently coalesced in [./packages/server/test](./packages/server/test) - we import the different libs from here, this makes it easier for us to do integration testing + getting test coverage on the whole codebase.

> [![codecov](https://codecov.io/gh/trpc/trpc/branch/main/graph/badge.svg?token=KPPS918B0G)](https://codecov.io/gh/trpc/trpc) 
> 
> Some things regarding subscriptions is excluded in the coverage as it's an experimental feature


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
    <td align="center"><a href="https://sendou.cc/"><img src="https://avatars.githubusercontent.com/u/38327916?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Kalle</b></sub></a><br /><a href="https://github.com/trpc/trpc/issues?q=author%3ASendouc" title="Bug reports">🐛</a></td>
    <td align="center"><a href="http://granderath.tech"><img src="https://avatars.githubusercontent.com/u/22001111?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Malte Granderath</b></sub></a><br /><a href="https://github.com/trpc/trpc/issues?q=author%3Amgranderath" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://github.com/kripod"><img src="https://avatars.githubusercontent.com/u/14854048?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Kristóf Poduszló</b></sub></a><br /><a href="#ideas-kripod" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/issues?q=author%3Akripod" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://www.richardhaines.dev"><img src="https://avatars.githubusercontent.com/u/22930449?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Rich Haines</b></sub></a><br /><a href="#example-molebox" title="Examples">💡</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/simonedelmann"><img src="https://avatars.githubusercontent.com/u/2821076?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Simon Edelmann</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Code">💻</a> <a href="#ideas-simonedelmann" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Documentation">📖</a></td>
    <td align="center"><a href="https://anthonyshort.me"><img src="https://avatars.githubusercontent.com/u/36125?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Anthony Short</b></sub></a><br /><a href="#financial-anthonyshort" title="Financial">💵</a></td>
    <td align="center"><a href="https://hampuskraft.com"><img src="https://avatars.githubusercontent.com/u/24176136?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Hampus Kraft</b></sub></a><br /><a href="#financial-pnfcre" title="Financial">💵</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->



---

[![Powered by Vercel](./images/powered-by-vercel.svg "Powered by Vercel")](https://vercel.com/?utm_source=trpc&utm_campaign=oss)
