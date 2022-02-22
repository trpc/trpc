<p align="center">
  <a href="https://trpc.io/"><img src="./www/static/img/logo-text.svg" alt="tRPC" height="130"/></a>
</p>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <a href="https://codecov.io/gh/trpc/trpc">
    <img alt="codecov" src="https://codecov.io/gh/trpc/trpc/branch/main/graph/badge.svg?token=KPPS918B0G">
  </a>
  <a href="https://github.com/trpc/trpc/blob/main/LICENSE">
    <img alt="MIT License" src="https://img.shields.io/github/license/trpc/trpc" />
  </a>
  <a href="https://trpc.io/discord">
    <img alt="Discord" src="https://img.shields.io/discord/867764511159091230?color=7389D8&label&logo=discord&logoColor=ffffff" />
  </a>
</p>

<p></p>

<p align="center">
  <figure>
    <img src="https://storage.googleapis.com/trpc/trpcgif.gif" alt="Demo" />
    <figcaption>
      <p align="center">
        The client above is <strong>not</strong> importing any code from the server, only it's type declarations.
      </p>
    </figcaption>
  </figure>
</p>

<br/>

## Intro

tRPC allows you to easily build & consume fully typesafe APIs, without schemas or code generation.

### Features

- ✅&nbsp; Well-tested and production ready.
- 🧙‍♂️&nbsp; Full static typesafety & autocompletion on the client, for inputs, outputs and errors.
- 🐎&nbsp; Snappy DX - No code generation, run-time bloat, or build pipeline.
- 🍃&nbsp; Light - tRPC has zero deps and a tiny client-side footprint.
- 🐻&nbsp; Easy to add to your existing brownfield project.
- 🔋&nbsp; Batteries included - React.js/Next.js/Express.js adapters. _(But tRPC is not tied to React - [reach out](https://twitter.com/alexdotjs) if you want to make a Svelte/Vue/... adapter)_
- 🥃&nbsp; Subscriptions support.
- ⚡️&nbsp; Request batching - requests made at the same time can be automatically combined into one
- 👀&nbsp; Quite a few examples in the [./examples](./examples)-folder

## Quickstart

There are a few [examples](https://trpc.io/docs/example-apps) that you can use for playing out with tRCP or bootstrapping your new project. For example, if you want a next.js app, you can use the full-stack next.js example:

**Quick start with a full-stack Next.js example:**

```sh
# yarn
yarn create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
# npm
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

**👉 See full documentation on [tRPC.io](https://trpc.io/docs). 👈**

## Core Team

<table>
  <tr>
    <td align="center"><a href="https://twitter.com/alexdotjs"><img src="https://avatars.githubusercontent.com/u/459267?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alex / KATT</b></sub></a></td>
    <td>👋 Hi, I'm Alex and I am the creator of tRPC, don't hesitate to contact me on <a href="https://twitter.com/alexdotjs">Twitter</a> or <a href="mailto:alex@trpc.io">email</a> if you are curious about tRPC in any way.</td>
  </tr>
</table>

## Sponsors

If you enjoy working with tRPC and want to support me consider giving a token appreciation by [GitHub Sponsors](https://github.com/sponsors/KATT)!

Also, if your company using tRPC and want to support long-term maintenance of tRPC, have a look at the [sponsorship tiers](https://github.com/sponsors/KATT) or [get in touch](mailto:alex@trpc.io) to discuss potential partnerships.

### 🥇 Gold Sponsors

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://render.com"><img alt="Render.com" src="https://raw.githubusercontent.com/trpc/trpc/main/images/render.svg" width="273px" /><br />Render</a></td>
    </tr>
  </tbody>
</table>

### 🥈 Silver Sponsors

<table>
  <tbody>
    <tr>
      <td align="center"><a href="http://Youarerad.org"><img src="https://avatars.githubusercontent.com/u/22589564?v=4?s=125" width="125px;" alt=""/><br /><sub><b>Jason Docton</b></sub></td>
      <td align="center"><a href="https://ping.gg/"><img src="https://avatars.githubusercontent.com/u/89191727?v=4?s=125" width="125px;" alt=""/><br /><sub><b>Ping Labs</b></sub></a></td>
    </tr>
  </tbody>
</table>

### 🥉 Bronze Sponsors

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://newfront.com"><img src="https://user-images.githubusercontent.com/36125/130158930-216fa212-5909-4ee1-b4b9-fd5935f51245.png" width="120" alt=""/><br />Newfront</a></td>
      <td align="center"><a href="https://hidrb.com"><img src="https://avatars.githubusercontent.com/u/77294655?v=4?s=120" width="120" alt=""/><br/>Dr. B</a></td>
      <td align="center"><a href="https://cal.com"><img src="https://avatars.githubusercontent.com/u/79145102?s=200&v=4" width="120" alt=""/><br/>Cal.com</a></td>
      <td align="center"><a href="https://github.com/chimon2000"><img src="https://avatars.githubusercontent.com/u/6907797?v=4?s=120" width="120" alt=""/><br/>Ryan Edge</a></td>
    </tr>
    <tr>
      <td align="center"><a href="https://snaplet.dev"><img src="https://avatars.githubusercontent.com/u/69029941?v=4?s=120" width="120" alt=""/><br/>Snaplet</a></td>
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
      <td align="center"><a href="https://github.com/alexn-s"><img src="https://avatars.githubusercontent.com/u/60710873?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alex Schumacher</b></sub></a></td>
      <td align="center"><a href="https://react-hook-form.com"><img src="https://avatars.githubusercontent.com/u/10513364?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Bill</b></sub></a></td>
      <td align="center"><a href="https://github.com/chimon2000"><img src="https://avatars.githubusercontent.com/u/6907797?v=4?s=100" width="100px;" alt=""/><br/><sub><b>Ryan Edge</b></sub></a></td>
      <td align="center"><a href="https://www.illarionvk.com"><img src="https://avatars.githubusercontent.com/u/5012724?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Illarion Koperski</b></sub></a></td>
      <td align="center"><a href="http://abgn.me"><img src="https://avatars.githubusercontent.com/u/19674362?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Albin Groen</b></sub></a></td>
      <td align="center"><a href="https://timcole.me"><img src="https://avatars.githubusercontent.com/u/6754577?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Timothy Cole</b></sub></a></td>
      <td align="center"><a href="https://github.com/utevo"><img src="https://avatars.githubusercontent.com/u/29740731?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Michał Kowieski</b></sub></a></td>
    </tr>
    <tr>
      <td align="center"><a href="https://iamkhan.io"><img src="https://avatars.githubusercontent.com/u/6490268?v=4?s=100" width="100px;" alt=""/><br /><sub><b>SchlagerKhan</b></sub></a></td>
      <td align="center"><a href="https://yorick.sh"><img src="https://avatars.githubusercontent.com/u/8572133?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ethan Clark</b></sub></a></td>
      <td align="center"><a href="https://github.com/nihinihi01"><img src="https://avatars.githubusercontent.com/u/57569287?v=4?s=100" width="100px;" alt=""/><br /><sub><b>nihinihi01</b></sub></a></td>
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
    <td align="center"><a href="http://about.me/keenahn"><img src="https://avatars.githubusercontent.com/u/283603?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Keenahn Tiberius Jung</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=keenahn" title="Code">💻</a></td>
    <td align="center"><a href="https://roe.dev"><img src="https://avatars.githubusercontent.com/u/28706372?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Daniel Roe</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=danielroe" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/sachinraja"><img src="https://avatars.githubusercontent.com/u/58836760?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Sachin Raja</b></sub></a><br /><a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Asachinraja" title="Reviewed Pull Requests">👀</a> <a href="#ideas-sachinraja" title="Ideas, Planning, & Feedback">🤔</a> <a href="#mentoring-sachinraja" title="Mentoring">🧑‍🏫</a></td>
    <td align="center"><a href="https://github.com/mkreuzmayr"><img src="https://avatars.githubusercontent.com/u/20108212?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Michael Kreuzmayr</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=mkreuzmayr" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/kimroen"><img src="https://avatars.githubusercontent.com/u/520420?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Kim Røen</b></sub></a><br /><a href="#ideas-kimroen" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://standardresume.co/r/ryan-edge"><img src="https://avatars.githubusercontent.com/u/6907797?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ryan</b></sub></a><br /><a href="#financial-chimon2000" title="Financial">💵</a></td>
    <td align="center"><a href="https://www.snaplet.dev"><img src="https://avatars.githubusercontent.com/u/69029941?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Snaplet</b></sub></a><br /><a href="#financial-snaplet" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/merelinguist"><img src="https://avatars.githubusercontent.com/u/24858006?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Dylan Brookes</b></sub></a><br /><a href="#example-merelinguist" title="Examples">💡</a></td>
    <td align="center"><a href="http://guiselin.com"><img src="https://avatars.githubusercontent.com/u/24906387?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Marc Guiselin</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=MarcGuiselin" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3AMarcGuiselin" title="Reviewed Pull Requests">👀</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://www.illarionvk.com"><img src="https://avatars.githubusercontent.com/u/5012724?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Illarion Koperski</b></sub></a><br /><a href="#financial-illarionvk" title="Financial">💵</a></td>
    <td align="center"><a href="http://abgn.me"><img src="https://avatars.githubusercontent.com/u/19674362?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Albin Groen</b></sub></a><br /><a href="#financial-albingroen" title="Financial">💵</a></td>
    <td align="center"><a href="https://esamatti.fi/"><img src="https://avatars.githubusercontent.com/u/225712?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Esa-Matti Suuronen</b></sub></a><br /><a href="#example-esamattis" title="Examples">💡</a></td>
    <td align="center"><a href="https://timcole.me"><img src="https://avatars.githubusercontent.com/u/6754577?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Timothy Cole</b></sub></a><br /><a href="#financial-timcole" title="Financial">💵</a> <a href="#mentoring-timcole" title="Mentoring">🧑‍🏫</a></td>
    <td align="center"><a href="https://github.com/reggie3-braingu"><img src="https://avatars.githubusercontent.com/u/90011823?v=4?s=100" width="100px;" alt=""/><br /><sub><b>reggie3-braingu</b></sub></a><br /><a href="#example-reggie3-braingu" title="Examples">💡</a> <a href="https://github.com/trpc/trpc/commits?author=reggie3-braingu" title="Tests">⚠️</a> <a href="#financial-reggie3-braingu" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/ShiftySlothe"><img src="https://avatars.githubusercontent.com/u/59391676?v=4?s=100" width="100px;" alt=""/><br /><sub><b>ShiftySlothe</b></sub></a><br /><a href="#example-ShiftySlothe" title="Examples">💡</a></td>
    <td align="center"><a href="https://github.com/darioielardi"><img src="https://avatars.githubusercontent.com/u/19256200?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Dario Ielardi</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=darioielardi" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=darioielardi" title="Tests">⚠️</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/utevo"><img src="https://avatars.githubusercontent.com/u/29740731?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Michał Kowieski</b></sub></a><br /><a href="#financial-utevo" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/terose73"><img src="https://avatars.githubusercontent.com/u/34382127?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Theodore Rose</b></sub></a><br /><a href="#example-terose73" title="Examples">💡</a></td>
    <td align="center"><a href="https://www.linkedin.com/in/icflorescu"><img src="https://avatars.githubusercontent.com/u/581999?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ionut-Cristian Florescu</b></sub></a><br /><a href="#example-icflorescu" title="Examples">💡</a></td>
    <td align="center"><a href="https://www.twitch.tv/skarab42/"><img src="https://avatars.githubusercontent.com/u/62928763?v=4?s=100" width="100px;" alt=""/><br /><sub><b>skarab42</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=skarab42" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/commits?author=skarab42" title="Code">💻</a> <a href="#example-skarab42" title="Examples">💡</a> <a href="https://github.com/trpc/trpc/commits?author=skarab42" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://iamkhan.io"><img src="https://avatars.githubusercontent.com/u/6490268?v=4?s=100" width="100px;" alt=""/><br /><sub><b>SchlagerKhan</b></sub></a><br /><a href="#financial-SchlagerKhan" title="Financial">💵</a></td>
    <td align="center"><a href="https://www.brockherion.dev"><img src="https://avatars.githubusercontent.com/u/30359995?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Brock Herion</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=BrockHerion" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=BrockHerion" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=BrockHerion" title="Documentation">📖</a></td>
    <td align="center"><a href="https://render.com"><img src="https://avatars.githubusercontent.com/u/36424661?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Render</b></sub></a><br /><a href="#financial-renderinc" title="Financial">💵</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://yorick.sh"><img src="https://avatars.githubusercontent.com/u/8572133?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ethan Clark</b></sub></a><br /><a href="#financial-8balloon" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/nihinihi01"><img src="https://avatars.githubusercontent.com/u/57569287?v=4?s=100" width="100px;" alt=""/><br /><sub><b>nihinihi01</b></sub></a><br /><a href="#financial-nihinihi01" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/CommanderRoot"><img src="https://avatars.githubusercontent.com/u/4395417?v=4?s=100" width="100px;" alt=""/><br /><sub><b>CommanderRoot</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=CommanderRoot" title="Code">💻</a></td>
    <td align="center"><a href="http://Youarerad.org"><img src="https://avatars.githubusercontent.com/u/22589564?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jason Docton</b></sub></a><br /><a href="#financial-JasonDocton" title="Financial">💵</a></td>
    <td align="center"><a href="https://ping.gg/"><img src="https://avatars.githubusercontent.com/u/89191727?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ping Labs</b></sub></a><br /><a href="#financial-pingdotgg" title="Financial">💵</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

---

[![Powered by Vercel](./images/powered-by-vercel.svg 'Powered by Vercel')](https://vercel.com/?utm_source=trpc&utm_campaign=oss)
