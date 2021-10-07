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


> 💬 Join the tRPC Discord server to chat to other people using tRPC - [trpc.io/discord](https://trpc.io/discord)

## Intro


tRPC allows you to easily build & consume fully typesafe APIs, without schemas or code generation.

- 🧙‍♂️&nbsp; Full static typesafety & autocompletion on the client - on inputs, outputs, & errors.
- 🐎&nbsp; Snappy DX. No code generation, run-time bloat, or build pipeline.
- 🍃&nbsp; Light. tRPC has zero deps and a tiny client-side footprint.
- 🐻&nbsp; Easy to add to your existing brownfield project.
- 🔋&nbsp; Batteries included. React-library + Next.js/Express adapters. _(But tRPC is not tied to React - [reach out](https://twitter.com/alexdotjs) if you want to make a Svelte/Vue/... lib)_
- 🥃&nbsp; Simple to use APIs for queries, mutations, & subscriptions support.
- ⚡️&nbsp; Request batching - requests made at the same time can be automatically combined into one


... and:

- 👀&nbsp; Quite a few examples in the [./examples](./examples)-folder
- ✅&nbsp; It's well-tested & running in production.


> Still reading? Follow [**@alexdotjs** on Twitter](https://twitter.com/alexdotjs) if you have any questions or want to keep up to date what's coming next.

---

- [Intro](#intro)
- [Usage](#usage)
- [Core Team](#core-team)
- [Financial Contributors](#financial-contributors)
  - [🥉 Bronze Sponsors](#-bronze-sponsors)
  - [😻 Individuals](#-individuals)
- [All contributors ✨](#all-contributors-)


## Usage

**👉  See full documentation documentation on [tRPC.io](https://trpc.io/docs). 👈**


**Quick start with a full-stack Next.js example:**

```sh
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

## Core Team

<table>
  <tr>
    <td align="center"><a href="https://twitter.com/alexdotjs"><img src="https://avatars.githubusercontent.com/u/459267?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alex / KATT</b></sub></a></td>
  </tr>
</table>


> 👋 Hi, I'm Alex and I am the creator of tRPC, don't hesitate to contact me on [Twitter](https://twitter.com/alexdotjs) or [email](mailto:alex@trpc.io) if you are curious about tRPC in any way.



## Financial Contributors

> If you like working with tRPC, consider giving a token a apprecation by [GitHub Sponsors](https://github.com/sponsors/KATT)!


**For companies**

> Is your company using tRPC, want to attract amazing TypeScript developers to your team, & support long-term maintainance of tRPC? Have a look at the [sponsorship tiers](https://github.com/sponsors/KATT) or [get in touch](mailto:alex@trpc.io) to discuss potential partnerships.

<!-- 
### 🥉 Gold Sponsors

<img src="https://placehold.jp/e5faff/0e3847/300x150.png?text=%3Cimg%20%2F%3E" width="300" height="150">

### 🥉 Silver Sponsors

<img src="https://placehold.jp/e5faff/0e3847/150x150.png?text=%3Cimg%20%2F%3E" width="150" height="150"> 
-->

### 🥉 Bronze Sponsors

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://newfront.com"><img src="https://user-images.githubusercontent.com/36125/130158930-216fa212-5909-4ee1-b4b9-fd5935f51245.png" width="143" alt=""/><br />Newfront</a></td>
      <td align="center"><a href="https://hidrb.com"><img src="https://avatars.githubusercontent.com/u/77294655?v=4?s=143" width="143" alt=""/><br/>Dr. B</a></td>
      <td align="center"><a href="https://cal.com"><img src="https://avatars.githubusercontent.com/u/79145102?s=200&v=4" width="143" alt=""/><br/>Cal.com</a></td>
    </tr>
  </tbody>
</table>


### 😻 Individuals


<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://anthonyshort.me"><img src="https://avatars.githubusercontent.com/u/36125?v=4?s=100" width="100" alt=""/><br /><sub><b>Anthony Short</b></sub></a></td>
      <td align="center"><a href="https://hampuskraft.com"><img src="https://avatars.githubusercontent.com/u/24176136?v=4?s=100" width="100" alt=""/><br /><sub><b>Hampus Kraft</b></sub></a></td>
      <td align="center"><a href="http://www.appdome.com"><img src="https://avatars.githubusercontent.com/u/2037064?v=4?s=100" width="100" alt=""/><br /><sub><b>Daniel Yogel</b></sub></a></td>
      <td align="center"><a href="https://samholmes.net"><img src="https://avatars.githubusercontent.com/u/8385528?v=4?s=100" width="100" alt=""/><br /><sub><b>Sam Holmes</b></sub></a></td>
      <td align="center"><a href="https://github.com/jzimmek"><img src="https://avatars.githubusercontent.com/u/40382?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jan Zimmek</b></sub></a></td>
      <td align="center"><a href="http://t3.gg"><img src="https://avatars.githubusercontent.com/u/6751787?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Theo Browne</b></sub></a></td>
      <td align="center"><a href="https://maxgreenwald.me"><img src="https://avatars.githubusercontent.com/u/2615374?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Max Greenwald</b></sub></a></td>
    </tr>
    <tr>
      <td align="center"><a href="https://ste.london"><img src="https://avatars.githubusercontent.com/u/150512?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Stephen Mount</b></sub></a></td>
      <td align="center"><a href="https://github.com/alexn-s"><img src="https://avatars.githubusercontent.com/u/60710873?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alex Schumacher</b></sub></a></td>
      <td align="center"><a href="https://react-hook-form.com"><img src="https://avatars.githubusercontent.com/u/10513364?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Bill</b></sub></a></td>
    </tr>
  </tbody>
</table>

## All contributors ✨

> tRPC is developed by [KATT](https://twitter.com/alexdotjs), originally based on a proof-of-concept by [colinhacks](https://github.com/colinhacks).

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
    <td align="center"><a href="https://github.com/simonedelmann"><img src="https://avatars.githubusercontent.com/u/2821076?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Simon Edelmann</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Code">💻</a> <a href="#ideas-simonedelmann" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Asimonedelmann" title="Reviewed Pull Requests">👀</a></td>
    <td align="center"><a href="https://anthonyshort.me"><img src="https://avatars.githubusercontent.com/u/36125?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Anthony Short</b></sub></a><br /><a href="#financial-anthonyshort" title="Financial">💵</a></td>
    <td align="center"><a href="https://hampuskraft.com"><img src="https://avatars.githubusercontent.com/u/24176136?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Hampus Kraft</b></sub></a><br /><a href="#financial-pnfcre" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/hypnodron"><img src="https://avatars.githubusercontent.com/u/3454041?v=4?s=100" width="100px;" alt=""/><br /><sub><b>hypnodron</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=hypnodron" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=hypnodron" title="Code">💻</a> <a href="https://github.com/trpc/trpc/issues?q=author%3Ahypnodron" title="Bug reports">🐛</a></td>
    <td align="center"><a href="http://www.appdome.com"><img src="https://avatars.githubusercontent.com/u/2037064?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Daniel Yogel</b></sub></a><br /><a href="#financial-danielyogel" title="Financial">💵</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Adanielyogel" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/trpc/trpc/issues?q=author%3Adanielyogel" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://samholmes.net"><img src="https://avatars.githubusercontent.com/u/8385528?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Sam Holmes</b></sub></a><br /><a href="#financial-sam3d" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/mmkal"><img src="https://avatars.githubusercontent.com/u/15040698?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Misha Kaletsky</b></sub></a><br /><a href="#ideas-mmkal" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=mmkal" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=mmkal" title="Code">💻</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Ammkal" title="Reviewed Pull Requests">👀</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/lostfictions"><img src="https://avatars.githubusercontent.com/u/567041?v=4?s=100" width="100px;" alt=""/><br /><sub><b>s</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=lostfictions" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/jzimmek"><img src="https://avatars.githubusercontent.com/u/40382?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jan Zimmek</b></sub></a><br /><a href="#financial-jzimmek" title="Financial">💵</a></td>
    <td align="center"><a href="https://www.alaisteryoung.com"><img src="https://avatars.githubusercontent.com/u/10985857?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alaister Young</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=alaister" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=alaister" title="Tests">⚠️</a></td>
    <td align="center"><a href="http://t3.gg"><img src="https://avatars.githubusercontent.com/u/6751787?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Theo Browne</b></sub></a><br /><a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Atheobr" title="Reviewed Pull Requests">👀</a> <a href="#financial-theobr" title="Financial">💵</a></td>
    <td align="center"><a href="https://maxgreenwald.me"><img src="https://avatars.githubusercontent.com/u/2615374?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Max Greenwald</b></sub></a><br /><a href="#financial-mgreenw" title="Financial">💵</a> <a href="https://github.com/trpc/trpc/commits?author=mgreenw" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=mgreenw" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/commits?author=mgreenw" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/issues?q=author%3Amgreenw" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://ste.london"><img src="https://avatars.githubusercontent.com/u/150512?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Stephen Mount</b></sub></a><br /><a href="#financial-stemount" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/infix"><img src="https://avatars.githubusercontent.com/u/40860821?v=4?s=100" width="100px;" alt=""/><br /><sub><b>amr</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=infix" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="http://thomascoldwell.dev"><img src="https://avatars.githubusercontent.com/u/31568400?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Thomas Coldwell</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=thomas-coldwell" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/alexn-s"><img src="https://avatars.githubusercontent.com/u/60710873?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alex Schumacher</b></sub></a><br /><a href="#financial-alexn-s" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/ifiokjr"><img src="https://avatars.githubusercontent.com/u/1160934?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ifiok Jr.</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=ifiokjr" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=ifiokjr" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=ifiokjr" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/Memory-Lane-Games"><img src="https://avatars.githubusercontent.com/u/63847783?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Memory-Lane-Games</b></sub></a><br /><a href="#financial-Memory-Lane-Games" title="Financial">💵</a></td>
    <td align="center"><a href="https://react-hook-form.com"><img src="https://avatars.githubusercontent.com/u/10513364?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Bill</b></sub></a><br /><a href="#financial-bluebill1049" title="Financial">💵</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->



---

[![Powered by Vercel](./images/powered-by-vercel.svg "Powered by Vercel")](https://vercel.com/?utm_source=trpc&utm_campaign=oss)
