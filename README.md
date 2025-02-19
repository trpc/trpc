<a href="https://trpc.io/" target="_blank" rel="noopener">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://assets.trpc.io/www/trpc-readme-dark.png" />
    <img alt="tRPC" src="https://assets.trpc.io/www/trpc-readme.png" />
  </picture>
</a>

<div align="center">
  <h1>tRPC</h1>
  <h3>Move fast and break nothing.<br />End-to-end typesafe APIs made easy.</h3>
  <a href="https://codecov.io/gh/trpc/trpc">
    <img alt="codecov" src="https://codecov.io/gh/trpc/trpc/branch/next/graph/badge.svg?token=KPPS918B0G">
  </a>
  <a href="https://npmcharts.com/compare/@trpc/server?interval=30">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dm/%40trpc/server.svg">
  </a>
  <a href="https://github.com/trpc/trpc/blob/main/LICENSE">
    <img alt="MIT License" src="https://img.shields.io/github/license/trpc/trpc" />
  </a>
  <a href="https://trpc.io/discord">
    <img alt="Discord" src="https://img.shields.io/discord/867764511159091230?color=7389D8&label&logo=discord&logoColor=ffffff" />
  </a>
  <br />
  <a href="https://twitter.com/trpcio">
    <img alt="Twitter" src="https://img.shields.io/twitter/url.svg?label=%40trpcio&style=social&url=https%3A%2F%2Ftwitter.com%2Falexdotjs" />
  </a>
  <br />
  <br />
  <figure>
    <img src="https://assets.trpc.io/www/v10/v10-dark-landscape.gif" alt="Demo" />
    <figcaption>
      <p align="center">
        The client above is <strong>not</strong> importing any code from the server, only its type declarations.
      </p>
    </figcaption>
  </figure>
</div>

<br />

> [!NOTE]
>
> You are looking at the `next`-branch of tRPC which is the current work in progress representing **version 11**.
>
> - The functionality is **stable and can be used in production**, but we may do small breaking API-changes between patches until we reach `11.0.0`
> - The packages are published with the `next`-tag on npm
> - For the list of changes made, see https://trpc.io/docs/v11/migrate-from-v10-to-v11

## Intro

tRPC allows you to easily build & consume fully typesafe APIs without schemas or code generation.

### Features

- ✅&nbsp; Well-tested and production ready.
- 🧙‍♂️&nbsp; Full static typesafety & autocompletion on the client, for inputs, outputs, and errors.
- 🐎&nbsp; Snappy DX - No code generation, run-time bloat, or build pipeline.
- 🍃&nbsp; Light - tRPC has zero deps and a tiny client-side footprint.
- 🐻&nbsp; Easy to add to your existing brownfield project.
- 🔋&nbsp; Batteries included - React.js/Next.js/Express.js/Fastify adapters. _(But tRPC is not tied to React, and there are many [community adapters](https://trpc.io/docs/awesome-trpc#-extensions--community-add-ons) for other libraries)_
- 🥃&nbsp; Subscriptions support.
- ⚡️&nbsp; Request batching - requests made at the same time can be automatically combined into one
- 👀&nbsp; Quite a few examples in the [./examples](./examples)-folder

## Quickstart

There are a few [examples](https://trpc.io/docs/example-apps) that you can use for playing out with tRPC or bootstrapping your new project. For example, if you want a Next.js app, you can use the full-stack Next.js example:

**Quick start with a full-stack Next.js example:**

```sh
# yarn
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter

# npm
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter

# pnpm
pnpm create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter

# bun
bunx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter

# deno
deno init --npm next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

**👉 See full documentation on [tRPC.io](https://trpc.io/docs). 👈**

## Star History

<a href="https://star-history.com/#trpc/trpc"><img src="https://api.star-history.com/svg?repos=trpc/trpc&type=Date" alt="Star History Chart" width="600" /></a>

## Core Team

> Do you want to contribute? First, read the <a href="https://github.com/trpc/trpc/blob/main/CONTRIBUTING.md">Contributing Guidelines</a> before opening an issue or PR so you understand the branching strategy and local development environment. If you need any more guidance or want to ask more questions, feel free to write to us on <a href="https://trpc.io/discord">Discord</a>!

### Project leads

> The people who lead the API-design decisions and have the most active role in the development

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://twitter.com/alexdotjs"><img src="https://avatars.githubusercontent.com/u/459267?v=4?s=100" width="100px;" alt=""/><br />Alex / KATT</a></td>
      <td align="center"><a href="http://www.jumr.dev"><img src="https://avatars.githubusercontent.com/u/51714798?v=4&s=100" width="100px;" alt=""/><br />Julius Marminge</a></td>
      <td align="center"><a href="https://github.com/Nick-Lucas"><img src="https://avatars.githubusercontent.com/u/8896153?v=4&s=100" width="100px;" alt=""/><br />Nick Lucas</a></td>
    </tr>
  </tbody>
</table>

### Active contributors

> People who actively help out improving the codebase by making PRs and reviewing code

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://github.com/hmatthieu"><img src="https://github.com/hmatthieu.png?v=4&s=100" width="100px;" alt=""/><br />Hubert Mathieu</a></td>
    </tr>
  </tbody>
</table>

### Special shout-outs

> Individuals who have made exceptional contributions to tRPC through code, documentation, community building, and other valuable efforts

<table>
  <tbody>
    <tr>
      <td align="center"><a href="http://t3.gg"><img src="https://avatars.githubusercontent.com/u/6751787?v=4?s=100" width="100px;" alt=""/><br />Theo Browne</a></td>
      <td align="center"><a href="https://twitter.com/s4chinraja"><img src="https://avatars.githubusercontent.com/u/58836760?v=4?s=100" width="100px;" alt=""/><br />Sachin Raja</a></td>
    </tr>
  </tbody>
</table>

## Sponsors

If you enjoy working with tRPC and want to support us, consider giving a token appreciation by [GitHub Sponsors](https://trpc.io/sponsor)!

<!-- SPONSORS:LIST:START -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->

### 🥇 Gold Sponsors

<table>
  <tr>
   <td align="center"><a href="https://retool.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/33817679?v=4&s=180" width="180" alt="Retool"/><br />Retool</a></td>
  </tr>
</table>

### 🥈 Silver Sponsors

<table>
  <tr>
   <td align="center"><a href="https://cal.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/79145102?v=4&s=150" width="150" alt="Cal.com,%20Inc."/><br />Cal.com, Inc.</a></td>
   <td align="center"><a href="https://greptile.com/?utm_source=opensource&utm_medium=github&utm_campaign=trpc"><img src="https://github.com/greptileai.png?s=150" width="150" alt="Greptile"/><br />Greptile</a></td>
   <td align="center"><a href="https://www.coderabbit.ai/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/132028505?v=4&s=150" width="150" alt="CodeRabbit"/><br />CodeRabbit</a></td>
  </tr>
</table>

### 🥉 Bronze Sponsors

<table>
  <tr>
   <td align="center"><a href="https://github.com/hidrb"><img src="https://avatars.githubusercontent.com/u/77294655?v=4&s=120" width="120" alt="Dr.%20B"/><br />Dr. B</a></td>
   <td align="center"><a href="https://github.com/ryanmagoon"><img src="https://avatars.githubusercontent.com/u/5327290?v=4&s=120" width="120" alt="Ryan%20Magoon"/><br />Ryan Magoon</a></td>
  </tr>
</table>

### 😻 Smaller Backers

<table>
  <tr>
   <td align="center"><a href="https://backyard.ai/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/95662801?v=4&s=100" width="100" alt="Ahoy%20Labs"/><br />Ahoy Labs</a></td>
   <td align="center"><a href="https://unkey.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/138932600?v=4&s=100" width="100" alt="Unkey"/><br />Unkey</a></td>
   <td align="center"><a href="http://ballingt.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/458879?u=4b045ac75d721b6ac2b42a74d7d37f61f0414031&v=4&s=100" width="100" alt="Tom%20Ballinger"/><br />Tom Ballinger</a></td>
   <td align="center"><a href="https://proxidize.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/70805857?v=4&s=100" width="100" alt="Proxidize"/><br />Proxidize</a></td>
   <td align="center"><a href="http://brooke.me/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/8385528?u=08c901b73aded76277bb9b09711ec3404ce97eb5&v=4&s=100" width="100" alt="Brooke%20Holmes"/><br />Brooke Holmes</a></td>
   <td align="center"><a href="https://maxgreenwald.me/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/2615374?u=4c1402dd1e4e8ff7514f2e300adfe9b75ae76e85&v=4&s=100" width="100" alt="Max%20Greenwald"/><br />Max Greenwald</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/dmaykov"><img src="https://avatars.githubusercontent.com/u/6147048?u=8ae662ac99e91917062164de0d9404002b99cf2e&v=4&s=100" width="100" alt="Dmitry%20Maykov"/><br />Dmitry Maykov</a></td>
   <td align="center"><a href="https://chrisbradley.dev/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/11767079?u=e64f67faffd350af19aa896ff89a0708829e9a2a&v=4&s=100" width="100" alt="Chris%20Bradley"/><br />Chris Bradley</a></td>
   <td align="center"><a href="http://openq.dev/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/28826387?u=34c5f1594ad1ce83b111390b604ed5d26e389815&v=4&s=100" width="100" alt="rickk"/><br />rickk</a></td>
   <td align="center"><a href="http://www.jaronheard.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/7065695?u=127a7eca50605c12366363d6aba3da9e749aeff7&v=4&s=100" width="100" alt="Jaron%20Heard"/><br />Jaron Heard</a></td>
   <td align="center"><a href="https://www.illarionvk.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/5012724?u=7cfa13652f7ac5fb3c56d880e3eb3fbe40c3ea34&v=4&s=100" width="100" alt="Illarion%20Koperski"/><br />Illarion Koperski</a></td>
   <td align="center"><a href="https://iamkhan.io/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/6490268?u=59a369dc23fca0ed9943e5f020ff27ca968704d9&v=4&s=100" width="100" alt="Kalle"/><br />Kalle</a></td>
  </tr>
  <tr>
   <td align="center"><a href="http://jwyce.gg/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/16946573?u=8a27004b3c768f029b2f49b7cf5d3b94c62a16a1&v=4&s=100" width="100" alt="Jared%20Wyce"/><br />Jared Wyce</a></td>
   <td align="center"><a href="https://www.fanvue.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/72873652?v=4&s=100" width="100" alt="fanvue"/><br />fanvue</a></td>
   <td align="center"><a href="https://github.com/AscentFactory"><img src="https://avatars.githubusercontent.com/u/33631274?v=4&s=100" width="100" alt="Ascent%20Factory"/><br />Ascent Factory</a></td>
   <td align="center"><a href="https://github.com/drwpwrs"><img src="https://avatars.githubusercontent.com/u/49917220?u=ceb7a6b68f6366882ac7bc599383382f48e41e94&v=4&s=100" width="100" alt="Drew%20Powers"/><br />Drew Powers</a></td>
   <td align="center"><a href="https://drizzle.team/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/108468352?v=4&s=100" width="100" alt="Drizzle%20Team"/><br />Drizzle Team</a></td>
   <td align="center"><a href="https://github.com/cerjs"><img src="https://avatars.githubusercontent.com/u/5610115?u=be201750effeb8826a788dea206e594008cfe3f2&v=4&s=100" width="100" alt="Sail%20Jess"/><br />Sail Jess</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://liminity.se/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/179804668?v=4&s=100" width="100" alt="Liminity%20AB"/><br />Liminity AB</a></td>
   <td align="center"><a href="https://github.com/val-town"><img src="https://avatars.githubusercontent.com/u/114268765?v=4&s=100" width="100" alt="Val%20Town"/><br />Val Town</a></td>
   <td align="center"><a href="https://jonas-strassel.de/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/4662748?u=c8153c564cd341ccd0ccbbc695a2292587dc1679&v=4&s=100" width="100" alt="Jonas%20Strassel"/><br />Jonas Strassel</a></td>
   <td align="center"><a href="https://www.spencermckenney.com/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/15722950?u=e9b60ab93918fb2352b6357571cd67b9004d91e6&v=4&s=100" width="100" alt="Spencer%20McKenney"/><br />Spencer McKenney</a></td>
   <td align="center"><a href="https://www.stefan-wallin.se/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/457653?u=548c6e3482bd0c0d935d99b9c564fdbbe0d8da5d&v=4&s=100" width="100" alt="Stefan%20Wallin"/><br />Stefan Wallin</a></td>
   <td align="center"><a href="https://github.com/maiconcarraro"><img src="https://avatars.githubusercontent.com/u/13419087?u=34a2d709766786d981dc43186d9f4831699fbf1a&v=4&s=100" width="100" alt="Maicon%20Carraro"/><br />Maicon Carraro</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/infodusha"><img src="https://avatars.githubusercontent.com/u/5677047?u=d503fccc70c9a66524639691b62853994335af0b&v=4&s=100" width="100" alt="Andrei%20Karushev"/><br />Andrei Karushev</a></td>
   <td align="center"><a href="https://venue.ink/?ref=trpc&utm_source=github&utm_medium=referral&utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/67328248?v=4&s=100" width="100" alt="Venue%20Ink"/><br />Venue Ink</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- SPONSORS:LIST:END -->

## All contributors ✨

<a href="https://github.com/trpc/trpc/graphs/contributors">
  <p align="center">
    <img width="720" src="https://contrib.rocks/image?repo=trpc/trpc" alt="A table of avatars from the project's contributors" />
  </p>
</a>

---

<a href="https://vercel.com/?utm_source=trpc&utm_campaign=oss">
  <p align="center">
    <img src="./www/static/img/powered-by-vercel.svg" alt="Powered by Vercel" title="Powered by Vercel">
  </p>
</a>
