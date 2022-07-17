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
  <a href="https://twitter.com/alexdotjs">
    <img alt="Twitter" src="https://img.shields.io/twitter/url.svg?label=Follow%20%40alexdotjs&style=social&url=https%3A%2F%2Ftwitter.com%2Falexdotjs" />
  </a>
</p>

<p></p>

<p align="center">
  <figure>
    <img src="https://storage.googleapis.com/trpc/trpcgif.gif" alt="Demo" />
    <figcaption>
      <p align="center">
        The client above is <strong>not</strong> importing any code from the server, only its type declarations.
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
- 🔋&nbsp; Batteries included - React.js/Next.js/Express.js/Fastify adapters. _(But tRPC is not tied to React - [reach out](https://twitter.com/alexdotjs) if you want to make a Svelte/Vue/... adapter)_
- 🥃&nbsp; Subscriptions support.
- ⚡️&nbsp; Request batching - requests made at the same time can be automatically combined into one
- 👀&nbsp; Quite a few examples in the [./examples](./examples)-folder

## Quickstart

There are a few [examples](https://trpc.io/docs/example-apps) that you can use for playing out with tRPC or bootstrapping your new project. For example, if you want a next.js app, you can use the full-stack next.js example:

**Quick start with a full-stack Next.js example:**

```sh
# yarn
yarn create next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
# npm
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

**👉 See full documentation on [tRPC.io](https://trpc.io/docs). 👈**

## Star History

> tRPC is rapidly gaining momentum!

<a href="https://star-history.com/#trpc/trpc"><img src="https://api.star-history.com/svg?repos=trpc/trpc&type=Date" alt="Star History Chart" width="600" /></a>

## Core Team

<table>
  <tr>
    <td align="center"><a href="https://twitter.com/alexdotjs"><img src="https://avatars.githubusercontent.com/u/459267?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Alex / KATT</b></sub></a></td>
    <td>👋 Hi, I'm Alex and I am the creator of tRPC, don't hesitate to contact me on <a href="https://twitter.com/alexdotjs">Twitter</a> or <a href="mailto:alex@trpc.io">email</a> if you are curious about tRPC in any way.</td>
  </tr>
</table>


### Level 2 Maintainers

> Volunteers who actively help out improving the codebase by making PRs and reviewing code

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://github.com/sachinraja"><img src="https://avatars.githubusercontent.com/u/58836760?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Sachin Raja</b></sub></a></td>
      <td align="center"><a href="https://twitter.com/jlalmes"><img src="https://avatars.githubusercontent.com/u/69924001?v=4?s=100" width="100px;" alt=""/><br /><sub><b>James Berry</b></sub></a></td>
    </tr>
  </tbody>
</table>

### Level 1 Maintainers

> Volunteers that actively help out answering questions in Discord, GitHub Discussions, etc

*n/a* - do you want to contribute? Feel free to write to us on <a href="https://trpc.io/discord">Discord</a>.

## Sponsors

If you enjoy working with tRPC and want to support me consider giving a token appreciation by [GitHub Sponsors](https://github.com/sponsors/KATT)!

Also, if your company using tRPC and want to support long-term maintenance of tRPC, have a look at the [sponsorship tiers](https://github.com/sponsors/KATT) or [get in touch](mailto:alex@trpc.io) to discuss potential partnerships.

### 🥇 Gold Sponsors

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://render.com"><img src="https://avatars.githubusercontent.com/u/36424661?v=4?s=180" width="180px;" alt=""/><br /><sub><b>Render</b></sub></a></td>
      <td align="center"><a href="https://cal.com"><img src="https://avatars.githubusercontent.com/u/79145102?v=4?s=180" width="180px;" alt=""/><br /><b>Cal.com, Inc.</b></a></td>
      <td align="center"><a href="https://twitter.com/peer_rich"><img src="https://avatars.githubusercontent.com/u/8019099?v=4?s=180" width="180px;" alt=""/><br /><b>Peer Richelsen</b></a></td>
    </tr>
  </tbody>
</table>

### 🥈 Silver Sponsors

<table>
  <tbody>
    <tr>
      <td align="center"><a href="http://Youarerad.org"><img src="https://avatars.githubusercontent.com/u/22589564?v=4?s=150" width="150px;" alt=""/><br /><sub><b>Jason Docton</b></sub></a></td>
      <td align="center"><a href="https://ping.gg/"><img src="https://avatars.githubusercontent.com/u/89191727?v=4?s=150" width="150px;" alt=""/><br /><sub><b>Ping Labs</b></sub></a></td>
    </tr>
  </tbody>
</table>

### 🥉 Bronze Sponsors

<table>
  <tbody>
    <tr>
      <td align="center"><a href="https://newfront.com"><img src="https://user-images.githubusercontent.com/36125/130158930-216fa212-5909-4ee1-b4b9-fd5935f51245.png" width="120" alt=""/><br />Newfront</a></td>
      <td align="center"><a href="https://hidrb.com"><img src="https://avatars.githubusercontent.com/u/77294655?v=4?s=120" width="120" alt=""/><br/>Dr. B</a></td>
      <td align="center"><a href="https://github.com/chimon2000"><img src="https://avatars.githubusercontent.com/u/6907797?v=4?s=120" width="120" alt=""/><br/>Ryan Edge</a></td>
    </tr>
    <tr>
      <td align="center"><a href="https://snaplet.dev"><img src="https://avatars.githubusercontent.com/u/69029941?v=4?s=120" width="120" alt=""/><br/>Snaplet</a></td>
      <td align="center"><a href="http://flylance.com"><img src="https://avatars.githubusercontent.com/u/67534310?v=4?s=100" width="120px;" alt=""/><br />Flylance</a></td>
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
      <td align="center"><a href="https://blog.lucasviana.dev"><img src="https://avatars.githubusercontent.com/u/13911440?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Lucas Viana</b></sub></a></td>
      <td align="center"><a href="https://farazpatankar.com/"><img src="https://avatars.githubusercontent.com/u/10681116?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Faraz Patankar</b></sub></a></td>
      <td align="center"><a href="https://github.com/okaforcj"><img src="https://avatars.githubusercontent.com/u/34102565?v=4?s=100" width="100px;" alt=""/><br /><sub><b>okaforcj</b></sub></a></td>
      <td align="center"><a href="http://www.ivanbuncic.com"><img src="https://avatars.githubusercontent.com/u/29887111?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Ivan Buncic</b></sub></a></td>
    </tr>
    <tr>
      <td align="center"><a href="http://solberg.is"><img src="https://avatars.githubusercontent.com/u/701?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Jökull Sólberg Auðunsson</b></sub></a></td>
      <td align="center"><a href="https://github.com/lmatheus"><img src="https://avatars.githubusercontent.com/u/8514703?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Luis Matheus</b></sub></a></td>
      <td align="center"><a href="https://github.com/dmaykov"><img src="https://avatars.githubusercontent.com/u/6147048?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Dmitry Maykov</b></sub></a></td>
      <td align="center"><a href="https://www.linkedin.com/in/zomars/"><img src="https://avatars.githubusercontent.com/u/3504472?v=4?s=100" width="100px;" alt=""/><br /><sub><b>Omar López</b></sub></a></td>
      <td align="center"><a href="https://tryhackme.com/p/zast99"><img src="https://avatars.githubusercontent.com/u/29718978?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Mateo Carriquí</b></sub></a></td>
      <td align="center"><a href="https://ixahmedxi.me"><img src="https://avatars.githubusercontent.com/u/20271968?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Ahmed Elsakaan</b></sub></a></td>
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
    <td align="center"><a href="https://twitter.com/alexdotjs"><img src="https://avatars.githubusercontent.com/u/459267?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Alex Johansson</b></sub></a><br /><a href="#ideas-KATT" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=KATT" title="Documentation">📖</a> <a href="#example-KATT" title="Examples">💡</a> <a href="#maintenance-KATT" title="Maintenance">🚧</a></td>
    <td align="center"><a href="https://colinhacks.com/"><img src="https://avatars.githubusercontent.com/u/3084745?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Colin McDonnell</b></sub></a><br /><a href="#ideas-colinhacks" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=colinhacks" title="Documentation">📖</a></td>
    <td align="center"><a href="https://pieter.venter.pro"><img src="https://avatars.githubusercontent.com/u/1845861?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Pieter Venter</b></sub></a><br /><a href="#ideas-cyrus-za" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Acyrus-za" title="Reviewed Pull Requests">👀</a></td>
    <td align="center"><a href="https://sendou.cc/"><img src="https://avatars.githubusercontent.com/u/38327916?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Kalle</b></sub></a><br /><a href="https://github.com/trpc/trpc/issues?q=author%3ASendouc" title="Bug reports">🐛</a></td>
    <td align="center"><a href="http://granderath.tech"><img src="https://avatars.githubusercontent.com/u/22001111?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Malte Granderath</b></sub></a><br /><a href="https://github.com/trpc/trpc/issues?q=author%3Amgranderath" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://github.com/kripod"><img src="https://avatars.githubusercontent.com/u/14854048?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Kristóf Poduszló</b></sub></a><br /><a href="#ideas-kripod" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/issues?q=author%3Akripod" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://www.richardhaines.dev"><img src="https://avatars.githubusercontent.com/u/22930449?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Rich Haines</b></sub></a><br /><a href="#example-molebox" title="Examples">💡</a></td>
    <td align="center"><a href="https://github.com/simonedelmann"><img src="https://avatars.githubusercontent.com/u/2821076?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Simon Edelmann</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Code">💻</a> <a href="#ideas-simonedelmann" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=simonedelmann" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Asimonedelmann" title="Reviewed Pull Requests">👀</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://anthonyshort.me"><img src="https://avatars.githubusercontent.com/u/36125?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Anthony Short</b></sub></a><br /><a href="#financial-anthonyshort" title="Financial">💵</a></td>
    <td align="center"><a href="https://hampuskraft.com"><img src="https://avatars.githubusercontent.com/u/24176136?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Hampus Kraft</b></sub></a><br /><a href="#financial-pnfcre" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/hypnodron"><img src="https://avatars.githubusercontent.com/u/3454041?v=4?s=60" width="60px;" alt=""/><br /><sub><b>hypnodron</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=hypnodron" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=hypnodron" title="Code">💻</a> <a href="https://github.com/trpc/trpc/issues?q=author%3Ahypnodron" title="Bug reports">🐛</a></td>
    <td align="center"><a href="http://www.appdome.com"><img src="https://avatars.githubusercontent.com/u/2037064?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Daniel Yogel</b></sub></a><br /><a href="#financial-danielyogel" title="Financial">💵</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Adanielyogel" title="Reviewed Pull Requests">👀</a> <a href="https://github.com/trpc/trpc/issues?q=author%3Adanielyogel" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://samholmes.net"><img src="https://avatars.githubusercontent.com/u/8385528?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Sam Holmes</b></sub></a><br /><a href="#financial-sam3d" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/mmkal"><img src="https://avatars.githubusercontent.com/u/15040698?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Misha Kaletsky</b></sub></a><br /><a href="#ideas-mmkal" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=mmkal" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=mmkal" title="Code">💻</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Ammkal" title="Reviewed Pull Requests">👀</a></td>
    <td align="center"><a href="https://github.com/lostfictions"><img src="https://avatars.githubusercontent.com/u/567041?v=4?s=60" width="60px;" alt=""/><br /><sub><b>s</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=lostfictions" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/jzimmek"><img src="https://avatars.githubusercontent.com/u/40382?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Jan Zimmek</b></sub></a><br /><a href="#financial-jzimmek" title="Financial">💵</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://www.alaisteryoung.com"><img src="https://avatars.githubusercontent.com/u/10985857?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Alaister Young</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=alaister" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=alaister" title="Tests">⚠️</a></td>
    <td align="center"><a href="http://t3.gg"><img src="https://avatars.githubusercontent.com/u/6751787?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Theo Browne</b></sub></a><br /><a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Atheobr" title="Reviewed Pull Requests">👀</a> <a href="#financial-theobr" title="Financial">💵</a> <a href="#video-theobr" title="Videos">📹</a> <a href="#talk-theobr" title="Talks">📢</a> <a href="#tutorial-theobr" title="Tutorials">✅</a></td>
    <td align="center"><a href="https://maxgreenwald.me"><img src="https://avatars.githubusercontent.com/u/2615374?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Max Greenwald</b></sub></a><br /><a href="#financial-mgreenw" title="Financial">💵</a> <a href="https://github.com/trpc/trpc/commits?author=mgreenw" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=mgreenw" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/commits?author=mgreenw" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/issues?q=author%3Amgreenw" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://ste.london"><img src="https://avatars.githubusercontent.com/u/150512?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Stephen Mount</b></sub></a><br /><a href="#financial-stemount" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/infix"><img src="https://avatars.githubusercontent.com/u/40860821?v=4?s=60" width="60px;" alt=""/><br /><sub><b>amr</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=infix" title="Code">💻</a></td>
    <td align="center"><a href="http://thomascoldwell.dev"><img src="https://avatars.githubusercontent.com/u/31568400?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Thomas Coldwell</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=thomas-coldwell" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/alexn-s"><img src="https://avatars.githubusercontent.com/u/60710873?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Alex Schumacher</b></sub></a><br /><a href="#financial-alexn-s" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/ifiokjr"><img src="https://avatars.githubusercontent.com/u/1160934?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Ifiok Jr.</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=ifiokjr" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=ifiokjr" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=ifiokjr" title="Documentation">📖</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/Memory-Lane-Games"><img src="https://avatars.githubusercontent.com/u/63847783?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Memory-Lane-Games</b></sub></a><br /><a href="#financial-Memory-Lane-Games" title="Financial">💵</a></td>
    <td align="center"><a href="https://react-hook-form.com"><img src="https://avatars.githubusercontent.com/u/10513364?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Bill</b></sub></a><br /><a href="#financial-bluebill1049" title="Financial">💵</a></td>
    <td align="center"><a href="http://about.me/keenahn"><img src="https://avatars.githubusercontent.com/u/283603?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Keenahn Tiberius Jung</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=keenahn" title="Code">💻</a></td>
    <td align="center"><a href="https://roe.dev"><img src="https://avatars.githubusercontent.com/u/28706372?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Daniel Roe</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=danielroe" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/sachinraja"><img src="https://avatars.githubusercontent.com/u/58836760?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Sachin Raja</b></sub></a><br /><a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3Asachinraja" title="Reviewed Pull Requests">👀</a> <a href="#ideas-sachinraja" title="Ideas, Planning, & Feedback">🤔</a> <a href="#mentoring-sachinraja" title="Mentoring">🧑‍🏫</a></td>
    <td align="center"><a href="https://github.com/mkreuzmayr"><img src="https://avatars.githubusercontent.com/u/20108212?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Michael Kreuzmayr</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=mkreuzmayr" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/kimroen"><img src="https://avatars.githubusercontent.com/u/520420?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Kim Røen</b></sub></a><br /><a href="#ideas-kimroen" title="Ideas, Planning, & Feedback">🤔</a></td>
    <td align="center"><a href="https://standardresume.co/r/ryan-edge"><img src="https://avatars.githubusercontent.com/u/6907797?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Ryan</b></sub></a><br /><a href="#financial-chimon2000" title="Financial">💵</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://www.snaplet.dev"><img src="https://avatars.githubusercontent.com/u/69029941?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Snaplet</b></sub></a><br /><a href="#financial-snaplet" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/merelinguist"><img src="https://avatars.githubusercontent.com/u/24858006?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Dylan Brookes</b></sub></a><br /><a href="#example-merelinguist" title="Examples">💡</a></td>
    <td align="center"><a href="http://guiselin.com"><img src="https://avatars.githubusercontent.com/u/24906387?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Marc Guiselin</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=MarcGuiselin" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/pulls?q=is%3Apr+reviewed-by%3AMarcGuiselin" title="Reviewed Pull Requests">👀</a></td>
    <td align="center"><a href="https://www.illarionvk.com"><img src="https://avatars.githubusercontent.com/u/5012724?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Illarion Koperski</b></sub></a><br /><a href="#financial-illarionvk" title="Financial">💵</a></td>
    <td align="center"><a href="http://abgn.me"><img src="https://avatars.githubusercontent.com/u/19674362?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Albin Groen</b></sub></a><br /><a href="#financial-albingroen" title="Financial">💵</a></td>
    <td align="center"><a href="https://esamatti.fi/"><img src="https://avatars.githubusercontent.com/u/225712?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Esa-Matti Suuronen</b></sub></a><br /><a href="#example-esamattis" title="Examples">💡</a></td>
    <td align="center"><a href="https://timcole.me"><img src="https://avatars.githubusercontent.com/u/6754577?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Timothy Cole</b></sub></a><br /><a href="#financial-timcole" title="Financial">💵</a> <a href="#mentoring-timcole" title="Mentoring">🧑‍🏫</a></td>
    <td align="center"><a href="https://github.com/reggie3-braingu"><img src="https://avatars.githubusercontent.com/u/90011823?v=4?s=60" width="60px;" alt=""/><br /><sub><b>reggie3-braingu</b></sub></a><br /><a href="#example-reggie3-braingu" title="Examples">💡</a> <a href="https://github.com/trpc/trpc/commits?author=reggie3-braingu" title="Tests">⚠️</a> <a href="#financial-reggie3-braingu" title="Financial">💵</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/ShiftySlothe"><img src="https://avatars.githubusercontent.com/u/59391676?v=4?s=60" width="60px;" alt=""/><br /><sub><b>ShiftySlothe</b></sub></a><br /><a href="#example-ShiftySlothe" title="Examples">💡</a></td>
    <td align="center"><a href="https://github.com/darioielardi"><img src="https://avatars.githubusercontent.com/u/19256200?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Dario Ielardi</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=darioielardi" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=darioielardi" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://github.com/utevo"><img src="https://avatars.githubusercontent.com/u/29740731?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Michał Kowieski</b></sub></a><br /><a href="#financial-utevo" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/terose73"><img src="https://avatars.githubusercontent.com/u/34382127?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Theodore Rose</b></sub></a><br /><a href="#example-terose73" title="Examples">💡</a></td>
    <td align="center"><a href="https://www.linkedin.com/in/icflorescu"><img src="https://avatars.githubusercontent.com/u/581999?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Ionut-Cristian Florescu</b></sub></a><br /><a href="#example-icflorescu" title="Examples">💡</a></td>
    <td align="center"><a href="https://www.twitch.tv/skarab42/"><img src="https://avatars.githubusercontent.com/u/62928763?v=4?s=60" width="60px;" alt=""/><br /><sub><b>skarab42</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=skarab42" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/commits?author=skarab42" title="Code">💻</a> <a href="#example-skarab42" title="Examples">💡</a> <a href="https://github.com/trpc/trpc/commits?author=skarab42" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://iamkhan.io"><img src="https://avatars.githubusercontent.com/u/6490268?v=4?s=60" width="60px;" alt=""/><br /><sub><b>SchlagerKhan</b></sub></a><br /><a href="#financial-SchlagerKhan" title="Financial">💵</a></td>
    <td align="center"><a href="https://www.brockherion.dev"><img src="https://avatars.githubusercontent.com/u/30359995?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Brock Herion</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=BrockHerion" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=BrockHerion" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=BrockHerion" title="Documentation">📖</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://render.com"><img src="https://avatars.githubusercontent.com/u/36424661?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Render</b></sub></a><br /><a href="#financial-renderinc" title="Financial">💵</a></td>
    <td align="center"><a href="https://yorick.sh"><img src="https://avatars.githubusercontent.com/u/8572133?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Ethan Clark</b></sub></a><br /><a href="#financial-8balloon" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/nihinihi01"><img src="https://avatars.githubusercontent.com/u/57569287?v=4?s=60" width="60px;" alt=""/><br /><sub><b>nihinihi01</b></sub></a><br /><a href="#financial-nihinihi01" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/CommanderRoot"><img src="https://avatars.githubusercontent.com/u/4395417?v=4?s=60" width="60px;" alt=""/><br /><sub><b>CommanderRoot</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=CommanderRoot" title="Code">💻</a></td>
    <td align="center"><a href="http://Youarerad.org"><img src="https://avatars.githubusercontent.com/u/22589564?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Jason Docton</b></sub></a><br /><a href="#financial-JasonDocton" title="Financial">💵</a></td>
    <td align="center"><a href="https://ping.gg/"><img src="https://avatars.githubusercontent.com/u/89191727?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Ping Labs</b></sub></a><br /><a href="#financial-pingdotgg" title="Financial">💵</a></td>
    <td align="center"><a href="http://www.emilbryggare.com"><img src="https://avatars.githubusercontent.com/u/1659740?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Emil Bryggare</b></sub></a><br /><a href="#example-emilbryggare" title="Examples">💡</a> <a href="https://github.com/trpc/trpc/commits?author=emilbryggare" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://github.com/ahhshm"><img src="https://avatars.githubusercontent.com/u/87268103?v=4?s=60" width="60px;" alt=""/><br /><sub><b>ahhshm</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=ahhshm" title="Documentation">📖</a> <a href="#example-ahhshm" title="Examples">💡</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://jamesbe.com"><img src="https://avatars.githubusercontent.com/u/69924001?v=4?s=60" width="60px;" alt=""/><br /><sub><b>James Berry</b></sub></a><br /><a href="https://github.com/trpc/trpc/issues?q=author%3Ajlalmes" title="Bug reports">🐛</a> <a href="#ideas-jlalmes" title="Ideas, Planning, & Feedback">🤔</a> <a href="https://github.com/trpc/trpc/commits?author=jlalmes" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=jlalmes" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://jwyce.github.io/portfolio/"><img src="https://avatars.githubusercontent.com/u/16946573?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Jared Wyce</b></sub></a><br /><a href="#financial-jwyce" title="Financial">💵</a></td>
    <td align="center"><a href="https://blog.lucasviana.dev"><img src="https://avatars.githubusercontent.com/u/13911440?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Lucas Viana</b></sub></a><br /><a href="#financial-mechamobau" title="Financial">💵</a></td>
    <td align="center"><a href="https://kevinlangleyjr.dev"><img src="https://avatars.githubusercontent.com/u/877634?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Kevin Langley Jr.</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=kevinlangleyjr" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/toyamarinyon"><img src="https://avatars.githubusercontent.com/u/535254?v=4?s=60" width="60px;" alt=""/><br /><sub><b>toyamarinyon</b></sub></a><br /><a href="#example-toyamarinyon" title="Examples">💡</a> <a href="https://github.com/trpc/trpc/commits?author=toyamarinyon" title="Code">💻</a></td>
    <td align="center"><a href="https://farazpatankar.com/"><img src="https://avatars.githubusercontent.com/u/10681116?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Faraz Patankar</b></sub></a><br /><a href="#financial-FarazPatankar" title="Financial">💵</a></td>
    <td align="center"><a href="http://johnschmitz.me"><img src="https://avatars.githubusercontent.com/u/25447051?v=4?s=60" width="60px;" alt=""/><br /><sub><b>John Schmitz</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=john-schmitz" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/okaforcj"><img src="https://avatars.githubusercontent.com/u/34102565?v=4?s=60" width="60px;" alt=""/><br /><sub><b>okaforcj</b></sub></a><br /><a href="#financial-okaforcj" title="Financial">💵</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/LouisHaftmann"><img src="https://avatars.githubusercontent.com/u/30736553?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Louis Haftmann</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=LouisHaftmann" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=LouisHaftmann" title="Tests">⚠️</a> <a href="https://github.com/trpc/trpc/commits?author=LouisHaftmann" title="Documentation">📖</a></td>
    <td align="center"><a href="https://marcin.page/"><img src="https://avatars.githubusercontent.com/u/5896181?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Perfect7M</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=Perfect7M" title="Code">💻</a></td>
    <td align="center"><a href="https://tijlvdb.me/"><img src="https://avatars.githubusercontent.com/u/10267586?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Tijl Van den Brugghen</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=kindlyfire" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/matthijscollabai"><img src="https://avatars.githubusercontent.com/u/89927222?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Matthijs Wolting</b></sub></a><br /><a href="https://github.com/trpc/trpc/issues?q=author%3Amatthijscollabai" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://lukahartwig.de"><img src="https://avatars.githubusercontent.com/u/7414521?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Luka Hartwig</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=lukahartwig" title="Code">💻</a> <a href="#maintenance-lukahartwig" title="Maintenance">🚧</a></td>
    <td align="center"><a href="http://flylance.com"><img src="https://avatars.githubusercontent.com/u/67534310?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Flylance</b></sub></a><br /><a href="#financial-flylance-apps" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/BWsix"><img src="https://avatars.githubusercontent.com/u/57709309?v=4?s=60" width="60px;" alt=""/><br /><sub><b>VFLC</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=BWsix" title="Documentation">📖</a></td>
    <td align="center"><a href="https://robsoriano.com"><img src="https://avatars.githubusercontent.com/u/13049130?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Robert Soriano</b></sub></a><br /><a href="#example-wobsoriano" title="Examples">💡</a> <a href="#tool-wobsoriano" title="Tools">🔧</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://lukevella.com"><img src="https://avatars.githubusercontent.com/u/676849?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Luke Vella</b></sub></a><br /><a href="#example-lukevella" title="Examples">💡</a> <a href="#tool-lukevella" title="Tools">🔧</a></td>
    <td align="center"><a href="https://github.com/jld-adriano"><img src="https://avatars.githubusercontent.com/u/98129582?v=4?s=60" width="60px;" alt=""/><br /><sub><b>João Adriano</b></sub></a><br /><a href="https://github.com/trpc/trpc/issues?q=author%3Ajld-adriano" title="Bug reports">🐛</a></td>
    <td align="center"><a href="http://www.nisse.tech"><img src="https://avatars.githubusercontent.com/u/495782?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Nils Kjellman</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=nilskj" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/luixo"><img src="https://avatars.githubusercontent.com/u/1051134?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Alexey Immoreev</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=luixo" title="Code">💻</a></td>
    <td align="center"><a href="https://github.com/bradennapier"><img src="https://avatars.githubusercontent.com/u/15365418?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Braden Napier</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=bradennapier" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=bradennapier" title="Tests">⚠️</a></td>
    <td align="center"><a href="http://www.big-sir.com"><img src="https://avatars.githubusercontent.com/u/3660667?v=4?s=60" width="60px;" alt=""/><br /><sub><b>bautistaaa</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=bautistaaa" title="Documentation">📖</a> <a href="#example-bautistaaa" title="Examples">💡</a></td>
    <td align="center"><a href="https://github.com/blntrsz"><img src="https://avatars.githubusercontent.com/u/81449016?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Balint Orosz</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=blntrsz" title="Documentation">📖</a></td>
    <td align="center"><a href="https://skovhus.dev"><img src="https://avatars.githubusercontent.com/u/1260305?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Kenneth Skovhus</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=skovhus" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/commits?author=skovhus" title="Code">💻</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/Lilja"><img src="https://avatars.githubusercontent.com/u/6134511?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Erik Lilja</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=lilja" title="Documentation">📖</a> <a href="https://github.com/trpc/trpc/commits?author=lilja" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=lilja" title="Tests">⚠️</a></td>
    <td align="center"><a href="http://www.ivanbuncic.com"><img src="https://avatars.githubusercontent.com/u/29887111?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Ivan Buncic</b></sub></a><br /><a href="#financial-ivanbuncic" title="Financial">💵</a></td>
    <td align="center"><a href="http://solberg.is"><img src="https://avatars.githubusercontent.com/u/701?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Jökull Sólberg Auðunsson</b></sub></a><br /><a href="#financial-jokull" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/futpib"><img src="https://avatars.githubusercontent.com/u/4330357?v=4?s=60" width="60px;" alt=""/><br /><sub><b>futpib</b></sub></a><br /><a href="https://github.com/trpc/trpc/issues?q=author%3Afutpib" title="Bug reports">🐛</a></td>
    <td align="center"><a href="https://github.com/lmatheus"><img src="https://avatars.githubusercontent.com/u/8514703?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Luis Matheus</b></sub></a><br /><a href="#financial-lmatheus" title="Financial">💵</a></td>
    <td align="center"><a href="http://franklinjara.dev"><img src="https://avatars.githubusercontent.com/u/65879341?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Franklin</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=makyfj" title="Documentation">📖</a></td>
    <td align="center"><a href="https://www.linkedin.com/in/zomars/"><img src="https://avatars.githubusercontent.com/u/3504472?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Omar López</b></sub></a><br /><a href="#financial-zomars" title="Financial">💵</a></td>
    <td align="center"><a href="https://diego-slicecode.dev/"><img src="https://avatars.githubusercontent.com/u/63283003?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Diego Massarini</b></sub></a><br /><a href="#financial-webdiego" title="Financial">💵</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/dmaykov"><img src="https://avatars.githubusercontent.com/u/6147048?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Dmitry Maykov</b></sub></a><br /><a href="#financial-dmaykov" title="Financial">💵</a></td>
    <td align="center"><a href="https://riccardogiorato.com/"><img src="https://avatars.githubusercontent.com/u/4527364?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Riccardo Giorato</b></sub></a><br /><a href="#financial-riccardogiorato" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/carlbarrdahl"><img src="https://avatars.githubusercontent.com/u/2961337?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Carl Barrdahl</b></sub></a><br /><a href="#financial-carlbarrdahl" title="Financial">💵</a></td>
    <td align="center"><a href="https://cal.com/peer"><img src="https://avatars.githubusercontent.com/u/8019099?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Peer Richelsen</b></sub></a><br /><a href="#financial-PeerRich" title="Financial">💵</a></td>
    <td align="center"><a href="https://cal.com"><img src="https://avatars.githubusercontent.com/u/79145102?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Cal.com, Inc.</b></sub></a><br /><a href="#financial-calcom" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/tomanagle"><img src="https://avatars.githubusercontent.com/u/8683577?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Tom</b></sub></a><br /><a href="#video-tomanagle" title="Videos">📹</a> <a href="#talk-tomanagle" title="Talks">📢</a> <a href="#tutorial-tomanagle" title="Tutorials">✅</a></td>
    <td align="center"><a href="https://github.com/3x071c"><img src="https://avatars.githubusercontent.com/u/87198856?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Victor Homic</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=3x071c" title="Code">💻</a> <a href="https://github.com/trpc/trpc/commits?author=3x071c" title="Tests">⚠️</a></td>
    <td align="center"><a href="https://ixahmedxi.me"><img src="https://avatars.githubusercontent.com/u/20271968?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Ahmed Elsakaan</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=ixahmedxi" title="Documentation">📖</a> <a href="#financial-ixahmedxi" title="Financial">💵</a></td>
  </tr>
  <tr>
    <td align="center"><a href="https://github.com/EnderSpirit"><img src="https://avatars.githubusercontent.com/u/28017013?v=4?s=60" width="60px;" alt=""/><br /><sub><b>EnderSpirit</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=EnderSpirit" title="Documentation">📖</a></td>
    <td align="center"><a href="http://www.jumr.dev"><img src="https://avatars.githubusercontent.com/u/51714798?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Julius Marminge</b></sub></a><br /><a href="#example-juliusmarminge" title="Examples">💡</a> <a href="https://github.com/trpc/trpc/commits?author=juliusmarminge" title="Documentation">📖</a></td>
    <td align="center"><a href="https://tryhackme.com/p/zast99"><img src="https://avatars.githubusercontent.com/u/29718978?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Mateo Carriquí</b></sub></a><br /><a href="#financial-system32uwu" title="Financial">💵</a></td>
    <td align="center"><a href="https://github.com/OlegGulevskyy"><img src="https://avatars.githubusercontent.com/u/43781031?v=4?s=60" width="60px;" alt=""/><br /><sub><b>Oleg Gulevskyy</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=OlegGulevskyy" title="Documentation">📖</a></td>
    <td align="center"><a href="https://github.com/joaosamouco"><img src="https://avatars.githubusercontent.com/u/6799006?v=4?s=60" width="60px;" alt=""/><br /><sub><b>João Samouco</b></sub></a><br /><a href="https://github.com/trpc/trpc/commits?author=joaosamouco" title="Tests">⚠️</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

---

[![Powered by Vercel](./images/powered-by-vercel.svg 'Powered by Vercel')](https://vercel.com/?utm_source=trpc&utm_campaign=oss)
