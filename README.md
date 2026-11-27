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
    <img alt="codecov" src="https://codecov.io/gh/trpc/trpc/branch/main/graph/badge.svg?token=KPPS918B0G">
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
  <a href="https://x.com/trpcio">
    <img alt="Follow @trpcio on X" src="https://img.shields.io/badge/%40trpcio-000000?logo=x&logoColor=ffffff" />
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

## Intro

tRPC lets you build and consume fully typesafe APIs without schemas or code generation.

### Features

- 🧙‍♂️&nbsp; Full static typesafety and autocompletion on the client, for inputs, outputs, and errors.
- 🐎&nbsp; No code generation, runtime bloat, or build pipeline.
- 🍃&nbsp; Zero dependencies and a tiny client-side footprint.
- 🐻&nbsp; Easy to add to an existing project.
- 🔋&nbsp; Adapters for Next.js, Express, Fastify, AWS Lambda, Fetch and more, plus TanStack Query integration. Not tied to React; see the [community add-ons](https://trpc.io/docs/community/awesome-trpc).
- 🥃&nbsp; Subscriptions over SSE and WebSockets.
- ⚡️&nbsp; Request batching: calls made at the same time are combined into one request.
- ✅&nbsp; Well-tested and production ready.

## Quickstart

Bootstrap a full-stack Next.js app from the [`next-prisma-starter`](./examples/next-prisma-starter) example:

```sh
npx create-next-app --example https://github.com/trpc/trpc --example-path examples/next-prisma-starter trpc-prisma-starter
```

Swap `npx create-next-app` for `pnpm create next-app`, `yarn create next-app` or `bunx create-next-app` if you prefer. More starters are in [`./examples`](./examples) and on the [example apps](https://trpc.io/docs/example-apps) page.

**👉 Read the full documentation on [trpc.io](https://trpc.io/docs). 👈**

## Contributing

Read the [Contributing Guidelines](./CONTRIBUTING.md) before opening an issue or PR; they cover the branching strategy and local setup. Questions are welcome on [Discord](https://trpc.io/discord).

<a href="https://github.com/trpc/trpc/graphs/contributors">
  <p align="center">
    <img width="720" src="https://contrib.rocks/image?repo=trpc/trpc" alt="A table of avatars from the project's contributors" />
  </p>
</a>

## Sponsors

If you enjoy working with tRPC and want to support us, consider giving a token appreciation by [GitHub Sponsors](https://trpc.io/sponsor)!

<!-- SPONSORS:LIST:START -->
<!-- oxfmt-ignore-start -->
<!-- markdownlint-disable -->

<p align="center">
  <a href="https://trpc.io/sponsor#sponsors"><img src="https://trpc.io/og/_/sponsor-cloud.png" width="600" alt="tRPC's sponsors, each drawn bigger the more they've given"/></a>
</p>

### Silver partners

<table>
  <tr>
   <td align="center"><a href="https://www.coderabbit.ai/?utm_source=github&amp;utm_medium=referral&amp;ref=trpc&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/132028505?v=4&amp;s=300" width="150" alt="CodeRabbit"/><br />CodeRabbit</a></td>
   <td align="center"><a href="https://greptile.com/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/140149887?v=4&amp;s=300" width="150" alt="Greptile"/><br />Greptile</a></td>
   <td align="center"><a href="https://serpapi.com/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://github.com/serpapi.png?s=300" width="150" alt="SerpApi"/><br />SerpApi</a></td>
  </tr>
</table>

### Backers

<table>
  <tr>
   <td align="center"><a href="https://unkey.com/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/138932600?v=4&amp;s=200" width="100" alt="Unkey"/><br />Unkey</a></td>
   <td align="center"><a href="https://github.com/hidrb"><img src="https://avatars.githubusercontent.com/u/77294655?v=4&amp;s=200" width="100" alt="Dr. B"/><br />Dr. B</a></td>
   <td align="center"><a href="https://github.com/ryanmagoon"><img src="https://avatars.githubusercontent.com/u/5327290?v=4&amp;s=200" width="100" alt="Ryan Magoon"/><br />Ryan Magoon</a></td>
   <td align="center"><a href="https://proxidize.com/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/70805857?v=4&amp;s=200" width="100" alt="Proxidize"/><br />Proxidize</a></td>
   <td align="center"><a href="https://liminity.se/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/179804668?v=4&amp;s=200" width="100" alt="Liminity AB"/><br />Liminity AB</a></td>
   <td align="center"><a href="https://bestkru.com/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/159320286?v=4&amp;s=200" width="100" alt="BestKru"/><br />BestKru</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://maxgreenwald.me/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/2615374?u=4c1402dd1e4e8ff7514f2e300adfe9b75ae76e85&amp;v=4&amp;s=200" width="100" alt="Max Greenwald"/><br />Max Greenwald</a></td>
   <td align="center"><a href="https://github.com/dmaykov"><img src="https://avatars.githubusercontent.com/u/6147048?u=8ae662ac99e91917062164de0d9404002b99cf2e&amp;v=4&amp;s=200" width="100" alt="Dmitry Maykov"/><br />Dmitry Maykov</a></td>
   <td align="center"><a href="https://chrisbradley.dev/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/11767079?u=e64f67faffd350af19aa896ff89a0708829e9a2a&amp;v=4&amp;s=200" width="100" alt="Chris Bradley"/><br />Chris Bradley</a></td>
   <td align="center"><a href="https://www.fanvue.com/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/72873652?v=4&amp;s=200" width="100" alt="fanvue"/><br />fanvue</a></td>
   <td align="center"><a href="https://aerius.se/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/107723282?u=2639caa14ce293a0b6202c5766a40bb99ac9697e&amp;v=4&amp;s=200" width="100" alt="Aerius Ventilation AB"/><br />Aerius Ventilation AB</a></td>
   <td align="center"><a href="https://automatio.ai/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/1984909?u=b7bf5bc40ed49df3c22f69d2da7b8d78709c49ed&amp;v=4&amp;s=200" width="100" alt="Stefan Smiljkovic"/><br />Stefan Smiljkovic</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://iamkhan.io/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/6490268?u=59a369dc23fca0ed9943e5f020ff27ca968704d9&amp;v=4&amp;s=200" width="100" alt="Kalle"/><br />Kalle</a></td>
   <td align="center"><a href="https://drizzle.team/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/108468352?v=4&amp;s=200" width="100" alt="Drizzle Team"/><br />Drizzle Team</a></td>
   <td align="center"><a href="https://www.spencermckenney.com/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/15722950?u=e9b60ab93918fb2352b6357571cd67b9004d91e6&amp;v=4&amp;s=200" width="100" alt="Spencer McKenney"/><br />Spencer McKenney</a></td>
   <td align="center"><a href="https://github.com/infodusha"><img src="https://avatars.githubusercontent.com/u/5677047?u=d503fccc70c9a66524639691b62853994335af0b&amp;v=4&amp;s=200" width="100" alt="Andrei Karushev"/><br />Andrei Karushev</a></td>
   <td align="center"><a href="https://www.venue.ink/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://images.opencollective.com/venue-ink/49dbae6/logo.png?height=200" width="100" alt="Venue.ink"/><br />Venue.ink</a></td>
   <td align="center"><a href="https://usevault.app/?ref=trpc&amp;utm_source=github&amp;utm_medium=referral&amp;utm_campaign=trpc"><img src="https://avatars.githubusercontent.com/u/203708130?v=4&amp;s=200" width="100" alt="Vault"/><br />Vault</a></td>
  </tr>
</table>

<!-- markdownlint-restore -->
<!-- oxfmt-ignore-end -->

<!-- SPONSORS:LIST:END -->
