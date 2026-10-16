<h1 align="center">oRPC - Typesafe APIs Made Simple 🪄</h1>

<div align="center">
  <a href="https://codecov.io/gh/middleapi/orpc">
    <img alt="codecov" src="https://codecov.io/gh/middleapi/orpc/branch/main/graph/badge.svg">
  </a>
  <a href="https://www.npmjs.com/package/@orpc/publisher">
    <img alt="weekly downloads" src="https://img.shields.io/npm/dw/%40orpc%2Fpublisher?logo=npm" />
  </a>
  <a href="https://app.codspeed.io/middleapi/orpc?utm_source=badge">
    <img alt="CodSpeed" src="https://img.shields.io/endpoint?url=https://codspeed.io/badge.json" />
  </a>
  <a href="https://github.com/middleapi/orpc/blob/main/LICENSE">
    <img alt="MIT License" src="https://img.shields.io/github/license/middleapi/orpc?logo=open-source-initiative" />
  </a>
  <a href="https://discord.gg/TXEbwRBvQn">
    <img alt="Discord" src="https://img.shields.io/discord/1308966753044398161?color=7389D8&label&logo=discord&logoColor=ffffff" />
  </a>
  <a href="https://deepwiki.com/middleapi/orpc">
    <img alt="Ask DeepWiki" src="https://img.shields.io/badge/Ask-DeepWiki-blue" />
  </a>
</div>

## Documentation

You can read the documentation [here](https://orpc.dev).

## Packages

**Core**

| Package                                                        | Purpose                                            | Docs                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [@orpc/contract](https://www.npmjs.com/package/@orpc/contract) | Define API contract as the single source of truth. | [Procedure Contract](https://orpc.dev/docs/contract/procedure), [Contract Router](https://orpc.dev/docs/contract/router), [Implementation](https://orpc.dev/docs/contract/implementation), [Generate from OpenAPI](https://orpc.dev/docs/contract/generate-from-openapi) |
| [@orpc/server](https://www.npmjs.com/package/@orpc/server)     | Build APIs or implement contracts.                 | [Procedure](https://orpc.dev/docs/procedure), [Router](https://orpc.dev/docs/router), [Middleware](https://orpc.dev/docs/middleware), [Context](https://orpc.dev/docs/context), [RPC Handler](https://orpc.dev/docs/rpc/handler)                                         |
| [@orpc/client](https://www.npmjs.com/package/@orpc/client)     | Consume APIs with end-to-end type safety.          | [Client-Side Clients](https://orpc.dev/docs/client/client-side), [Server-Side Clients](https://orpc.dev/docs/client/server-side), [RPC Link](https://orpc.dev/docs/rpc/link), [Error Handling](https://orpc.dev/docs/client/error-handling)                              |
| [@orpc/openapi](https://www.npmjs.com/package/@orpc/openapi)   | Add OpenAPI compatibility to APIs.                 | [OpenAPI Handler](https://orpc.dev/docs/openapi/handler), [OpenAPI Link](https://orpc.dev/docs/openapi/link), [Specification](https://orpc.dev/docs/openapi/specification), [Scalar](https://orpc.dev/docs/openapi/scalar)                                               |

**Schema validation**

| Package                                                      | Purpose                                                    | Docs                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------- |
| [@orpc/zod](https://www.npmjs.com/package/@orpc/zod)         | JSON Schema converter for [Zod](https://zod.dev/).         | [Zod](https://orpc.dev/docs/integrations/zod)         |
| [@orpc/valibot](https://www.npmjs.com/package/@orpc/valibot) | JSON Schema converter for [Valibot](https://valibot.dev/). | [Valibot](https://orpc.dev/docs/integrations/valibot) |
| [@orpc/arktype](https://www.npmjs.com/package/@orpc/arktype) | JSON Schema converter for [ArkType](https://arktype.io/).  | [ArkType](https://orpc.dev/docs/integrations/arktype) |

**Built-in features**

| Package                                                                          | Purpose                                                                                                                                                                                      | Docs                                                           |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| [@orpc/publisher](https://www.npmjs.com/package/@orpc/publisher)                 | Pub/Sub with memory, Redis, and Upstash adapters.                                                                                                                                            | [Publisher](https://orpc.dev/docs/helpers/publisher)           |
| [@orpc/ratelimit](https://www.npmjs.com/package/@orpc/ratelimit)                 | Rate limiting with memory, Redis, and Upstash adapters.                                                                                                                                      | [Rate Limit](https://orpc.dev/docs/helpers/ratelimit)          |
| [@orpc/experimental-lock](https://www.npmjs.com/package/@orpc/experimental-lock) | Locking with memory, Redis, and Upstash adapters.                                                                                                                                            | [Lock](https://orpc.dev/docs/helpers/lock)                     |
| [@orpc/hibernation](https://www.npmjs.com/package/@orpc/hibernation)             | Leverage Hibernation APIs like [Cloudflare's Hibernation WebSocket](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#durable-objects-hibernation-websocket-api). | [Hibernation](https://orpc.dev/docs/integrations/hibernation)  |
| [@orpc/json-schema](https://www.npmjs.com/package/@orpc/json-schema)             | Smart coercion for OpenAPI requests.                                                                                                                                                         | [Smart Coercion](https://orpc.dev/docs/plugins/smart-coercion) |

**Framework & ecosystem integrations**

| Package                                                                              | Purpose                                                                                               | Docs                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [@orpc/next](https://www.npmjs.com/package/@orpc/next)                               | Integrate with [Next.js Server Functions](https://nextjs.org/docs/app/getting-started/mutating-data). | [Next.js](https://orpc.dev/docs/integrations/next)                                                                                                                                                                      |
| [@orpc/ai-sdk](https://www.npmjs.com/package/@orpc/ai-sdk)                           | Turn contracts and procedures into [AI SDK](https://ai-sdk.dev/) tools.                               | [AI SDK](https://orpc.dev/docs/integrations/ai-sdk)                                                                                                                                                                     |
| [@orpc/tanstack-query](https://www.npmjs.com/package/@orpc/tanstack-query)           | Integrate with [TanStack Query](https://tanstack.com/query/latest).                                   | [TanStack Query](https://orpc.dev/docs/integrations/tanstack-query)                                                                                                                                                     |
| [@orpc/pinia-colada](https://www.npmjs.com/package/@orpc/pinia-colada)               | Integrate with [Pinia Colada](https://pinia-colada.esm.dev/).                                         | [Pinia Colada](https://orpc.dev/docs/integrations/pinia-colada)                                                                                                                                                         |
| [@orpc/swr](https://www.npmjs.com/package/@orpc/swr)                                 | Integrate with [SWR](https://swr.vercel.app/).                                                        | [SWR](https://orpc.dev/docs/integrations/swr)                                                                                                                                                                           |
| [@orpc/experimental-msw](https://www.npmjs.com/package/@orpc/experimental-msw)       | Mock procedures with [Mock Service Worker](https://mswjs.io/).                                        | [MSW](https://orpc.dev/docs/integrations/msw)                                                                                                                                                                           |
| [@orpc/experimental-effect](https://www.npmjs.com/package/@orpc/experimental-effect) | Integrate with [Effect](https://effect.website/).                                                     | [Effect](https://orpc.dev/docs/integrations/effect)                                                                                                                                                                     |
| [@orpc/nest](https://www.npmjs.com/package/@orpc/nest)                               | Implement your contract with [NestJS](https://nestjs.com/).                                           | [NestJS](https://orpc.dev/docs/integrations/nest)                                                                                                                                                                       |
| [@orpc/node](https://www.npmjs.com/package/@orpc/node)                               | [Node.js](https://nodejs.org/) plugins for static file serving and large uploads.                     | [Static File](https://orpc.dev/docs/plugins/static-file), [Tmp File Upload](https://orpc.dev/docs/plugins/tmp-file-upload), [Batch Response Compression](https://orpc.dev/docs/plugins/batch-response-compression)      |
| [@orpc/bun](https://www.npmjs.com/package/@orpc/bun)                                 | Adapters for [Bun's Redis](https://bun.sh/).                                                          | [Publisher](https://orpc.dev/docs/helpers/publisher), [Rate Limit](https://orpc.dev/docs/helpers/ratelimit), [Lock](https://orpc.dev/docs/helpers/lock)                                                                 |
| [@orpc/cloudflare](https://www.npmjs.com/package/@orpc/cloudflare)                   | Adapters for [Cloudflare Workers](https://developers.cloudflare.com/workers/).                        | [Publisher](https://orpc.dev/docs/helpers/publisher), [Rate Limit](https://orpc.dev/docs/helpers/ratelimit), [Lock](https://orpc.dev/docs/helpers/lock), [Traces](https://orpc.dev/docs/integrations/cloudflare-traces) |
| [@orpc/trpc](https://www.npmjs.com/package/@orpc/trpc)                               | Reuse existing [tRPC](https://trpc.io/) routers within oRPC.                                          | [tRPC](https://orpc.dev/docs/integrations/trpc)                                                                                                                                                                         |

**Observability**

| Package                                                                  | Purpose                                                                            | Docs                                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [@orpc/opentelemetry](https://www.npmjs.com/package/@orpc/opentelemetry) | Integrate with [OpenTelemetry](https://opentelemetry.io/) for distributed tracing. | [OpenTelemetry](https://orpc.dev/docs/integrations/opentelemetry) |
| [@orpc/pino](https://www.npmjs.com/package/@orpc/pino)                   | Integrate with [Pino](https://getpino.io/) for logging.                            | [Pino](https://orpc.dev/docs/integrations/pino)                   |
| [@orpc/evlog](https://www.npmjs.com/package/@orpc/evlog)                 | Integrate with [Evlog](https://evlog.dev/) for logging.                            | [Evlog](https://orpc.dev/docs/integrations/evlog)                 |

## Sponsors

Like what we build over at [middleapi](https://github.com/middleapi)? You can help keep it going through [GitHub Sponsors](https://github.com/sponsors/dinwwwh) or [Open Collective](https://opencollective.com/middleapi). Every bit helps! 🚀

<table>
  <tr>
   <td width="2000"><a href="https://screenshotone.com/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="The screenshot API for developers"><img src="https://avatars.githubusercontent.com/u/97035603?v=4" width="64" align="left" hspace="12" alt="ScreenshotOne.com"/><b>ScreenshotOne.com</b></a><br /><sub>The screenshot API for developers</sub></td>
  </tr>
  <tr>
   <td width="2000"><a href="https://yuzu.health/careers?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="We&#39;re hiring NYC based engineers"><img src="https://avatars.githubusercontent.com/u/102488956?v=4" width="64" align="left" hspace="12" alt="Yuzu"/><b>Yuzu</b></a><br /><sub>We&#39;re hiring NYC based engineers</sub></td>
  </tr>
  <tr>
   <td width="2000"><a href="https://misskey.io/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Decentralized microblogging SNS born on Earth"><img src="https://github.com/MisskeyIO.png" width="64" align="left" hspace="12" alt="MisskeyHQ"/><b>MisskeyHQ</b></a><br /><sub>Decentralized microblogging SNS born on Earth</sub></td>
  </tr>
</table>

### Premium Sponsors

<table>
  <tr>
   <td align="center"><a href="https://github.com/nexa-ca?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Nexa"><img src="https://avatars.githubusercontent.com/u/199146462?v=4" width="209" alt="Nexa"/><br />Nexa</a></td>
  </tr>
</table>

### Organization Sponsors

<table>
  <tr>
   <td align="center"><a href="https://lnmarkets.com/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="LN Markets"><img src="https://avatars.githubusercontent.com/u/70597625?v=4" width="167" alt="LN Markets"/><br />LN Markets</a></td>
  </tr>
</table>

### Sponsors

<table>
  <tr>
   <td align="center"><a href="https://github.com/hrmcdonald?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Reece McDonald"><img src="https://avatars.githubusercontent.com/u/39349270?v=4" width="139" alt="Reece McDonald"/><br />Reece McDonald</a></td>
   <td align="center"><a href="https://soymilk.party/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="あわわわとーにゅ"><img src="https://avatars.githubusercontent.com/u/17376330?u=de3353804be889f009f7e0a1582daf04d0ab292d&amp;v=4" width="139" alt="あわわわとーにゅ"/><br />あわわわとーにゅ</a></td>
   <td align="center"><a href="https://github.com/nicognaW?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="nk"><img src="https://avatars.githubusercontent.com/u/66731869?u=4699bda3a9092d3ec34fbd959450767bcc8b8b6d&amp;v=4" width="139" alt="nk"/><br />nk</a></td>
   <td align="center"><a href="https://supastarter.dev/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="supastarter"><img src="https://avatars.githubusercontent.com/u/110960143?v=4" width="139" alt="supastarter"/><br />supastarter</a></td>
   <td align="center"><a href="https://github.com/herrfugbaum?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="herrfugbaum"><img src="https://avatars.githubusercontent.com/u/12859776?u=644dc1666d0220bc0468eb0de3c56b919f635b16&amp;v=4" width="139" alt="herrfugbaum"/><br />herrfugbaum</a></td>
   <td align="center"><a href="https://laststance.io/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Ryota Murakami"><img src="https://avatars.githubusercontent.com/u/5501268?u=599389e03340734325726ca3f8f423c021d47d7f&amp;v=4" width="139" alt="Ryota Murakami"/><br />Ryota Murakami</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://cra.mr/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="David Cramer"><img src="https://avatars.githubusercontent.com/u/23610?v=4" width="139" alt="David Cramer"/><br />David Cramer</a></td>
   <td align="center"><a href="https://valerii15298.github.io/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Valerii Petryniak"><img src="https://avatars.githubusercontent.com/u/44531564?u=88ac74d9bacd20401518441907acad21063cd397&amp;v=4" width="139" alt="Valerii Petryniak"/><br />Valerii Petryniak</a></td>
   <td align="center"><a href="https://letstri.dev/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Valerii Strilets"><img src="https://avatars.githubusercontent.com/u/13253748?u=c7b10399ccc8f8081e24db94ec32cd9858e86ac3&amp;v=4" width="139" alt="Valerii Strilets"/><br />Valerii Strilets</a></td>
   <td align="center"><a href="https://blacklight.sh/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Kyle Mistele"><img src="https://avatars.githubusercontent.com/u/18430555?u=3afebeb81de666e35aaac3ed46f14159d7603ffb&amp;v=4" width="139" alt="Kyle Mistele"/><br />Kyle Mistele</a></td>
   <td align="center"><a href="https://github.com/christ12938?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="christ12938"><img src="https://avatars.githubusercontent.com/u/25758598?v=4" width="139" alt="christ12938"/><br />christ12938</a></td>
   <td align="center"><a href="https://github.com/Ryanjso?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Ryan Soderberg"><img src="https://avatars.githubusercontent.com/u/39172778?u=5ed913c31d57e7221b75784abcad48c7ebddde27&amp;v=4" width="139" alt="Ryan Soderberg"/><br />Ryan Soderberg</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/itigoore01?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="shota"><img src="https://avatars.githubusercontent.com/u/11831107?u=c976a6dc7e055eb026304c46c99100ed22b0c8e0&amp;v=4" width="139" alt="shota"/><br />shota</a></td>
   <td align="center"><a href="https://github.com/ellis-driscoll?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Ellis Driscoll"><img src="https://avatars.githubusercontent.com/u/70685966?u=c5f95bc33b5991d9744abe00052542e4a2ed3cb9&amp;v=4" width="139" alt="Ellis Driscoll"/><br />Ellis Driscoll</a></td>
   <td align="center"><a href="https://github.com/hoangbn?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Hoang Nguyen"><img src="https://avatars.githubusercontent.com/u/38968280?u=c90084c6de65c56facabab7ba13a72a49ddbc3e4&amp;v=4" width="139" alt="Hoang Nguyen"/><br />Hoang Nguyen</a></td>
   <td align="center"><a href="https://opencollective.com/guest-ac41de3b?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Orestis Ioannou"><img src="https://images.opencollective.com/guest-ac41de3b/avatar/460.png" width="139" alt="Orestis Ioannou"/><br />Orestis Ioannou</a></td>
   <td align="center"><a href="https://automatio.ai/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Stefan Smiljkovic"><img src="https://avatars.githubusercontent.com/u/1984909?u=b7bf5bc40ed49df3c22f69d2da7b8d78709c49ed&amp;v=4" width="139" alt="Stefan Smiljkovic"/><br />Stefan Smiljkovic</a></td>
  </tr>
</table>

### Backers

<table>
  <tr>
   <td align="center"><a href="https://github.com/rhinodavid?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="David Walsh"><img src="https://avatars.githubusercontent.com/u/5778036?u=b5521f07d2f88c3db2a0dae62b5f2f8357214af0&amp;v=4" width="119" alt="David Walsh"/><br />David Walsh</a></td>
   <td align="center"><a href="https://github.com/IPv4Addr?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="IPv4Addr"><img src="https://avatars.githubusercontent.com/u/100147665?u=59996b72f69bb53063cb7e9ff8b8f898616cd94d&amp;v=4" width="119" alt="IPv4Addr"/><br />IPv4Addr</a></td>
   <td align="center"><a href="https://robbevaes.be/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Robbe Vaes"><img src="https://avatars.githubusercontent.com/u/44748019?u=e0232402c045ad4eac7cbd217f1f47e083103b89&amp;v=4" width="119" alt="Robbe Vaes"/><br />Robbe Vaes</a></td>
   <td align="center"><a href="https://github.com/aidansunbury?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Aidan Sunbury"><img src="https://avatars.githubusercontent.com/u/64103161?v=4" width="119" alt="Aidan Sunbury"/><br />Aidan Sunbury</a></td>
   <td align="center"><a href="https://github.com/soonoo?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="soonoo"><img src="https://avatars.githubusercontent.com/u/5436405?u=5d0b4aa955c87e30e6bda7f0cccae5402da99528&amp;v=4" width="119" alt="soonoo"/><br />soonoo</a></td>
   <td align="center"><a href="https://kevinporten.dev/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Kevin Porten"><img src="https://avatars.githubusercontent.com/u/1839345?u=dc2263d5cfe0d927ce1a0be04a1d55dd6b55405c&amp;v=4" width="119" alt="Kevin Porten"/><br />Kevin Porten</a></td>
   <td align="center"><a href="https://github.com/pumpkinlink?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Denis"><img src="https://avatars.githubusercontent.com/u/11864620?u=5f47bbe6c65d0f6f5cf011021490238e4b0593d0&amp;v=4" width="119" alt="Denis"/><br />Denis</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://github.com/christopher-kapic?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Christopher Kapic"><img src="https://avatars.githubusercontent.com/u/59740769?u=e7ad4b72b5bf6c9eb1644c26dbf3332a8f987377&amp;v=4" width="119" alt="Christopher Kapic"/><br />Christopher Kapic</a></td>
   <td align="center"><a href="http://ballingt.com/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Tom Ballinger"><img src="https://avatars.githubusercontent.com/u/458879?u=4b045ac75d721b6ac2b42a74d7d37f61f0414031&amp;v=4" width="119" alt="Tom Ballinger"/><br />Tom Ballinger</a></td>
   <td align="center"><a href="https://lee-sam.com/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Sam"><img src="https://avatars.githubusercontent.com/u/102863520?u=3c89611f549d5070be232eb4532f690c8f2e7a65&amp;v=4" width="119" alt="Sam"/><br />Sam</a></td>
   <td align="center"><a href="https://github.com/Titoine?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Titoine"><img src="https://avatars.githubusercontent.com/u/3514286?u=1bb1e86b0c99c8a1121372e56d51a177eea12191&amp;v=4" width="119" alt="Titoine"/><br />Titoine</a></td>
   <td align="center"><a href="https://rigtch.fm/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Igor Makowski"><img src="https://avatars.githubusercontent.com/u/56691628?u=ee8c879478f7c151b9156aef6c74243fa3e247a8&amp;v=4" width="119" alt="Igor Makowski"/><br />Igor Makowski</a></td>
   <td align="center"><a href="https://blog.cwang.io/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="hanayashiki"><img src="https://avatars.githubusercontent.com/u/26056783?u=06c3b9205a16fd41a871e82da1cc2a09306d53f5&amp;v=4" width="119" alt="hanayashiki"/><br />hanayashiki</a></td>
   <td align="center"><a href="https://dubinets.io/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Lev Dubinets"><img src="https://avatars.githubusercontent.com/u/3114081?u=f547f5d5012cab54851f1b1ad72d10e537f78fc2&amp;v=4" width="119" alt="Lev Dubinets"/><br />Lev Dubinets</a></td>
  </tr>
  <tr>
   <td align="center"><a href="https://kellychan.im/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Kelly Peilin Chan"><img src="https://avatars.githubusercontent.com/u/520852?u=6b0f7105f694e7b5cacf410a3f04c7044b469dc8&amp;v=4" width="119" alt="Kelly Peilin Chan"/><br />Kelly Peilin Chan</a></td>
   <td align="center"><a href="https://guyariely.com/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Guy Ariely"><img src="https://avatars.githubusercontent.com/u/42813496?u=edb6b7f563bf28e160a290832e7da57c0506f8ca&amp;v=4" width="119" alt="Guy Ariely"/><br />Guy Ariely</a></td>
   <td align="center"><a href="https://paulsenon.com/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="PaulSenon"><img src="https://avatars.githubusercontent.com/u/19531087?u=6385741eb91d200b8c513ec6045482e301767ca6&amp;v=4" width="119" alt="PaulSenon"/><br />PaulSenon</a></td>
   <td align="center"><a href="https://nakasyou.how/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Shotaro Nakamura"><img src="https://avatars.githubusercontent.com/u/79000684?u=f644df3f29f0e8677a90967115774564f1d9d6ab&amp;v=4" width="119" alt="Shotaro Nakamura"/><br />Shotaro Nakamura</a></td>
   <td align="center"><a href="https://piscis.dev/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Alex"><img src="https://avatars.githubusercontent.com/u/326163?u=b245f368bd940cf51d08c0b6bf55f8257f359437&amp;v=4" width="119" alt="Alex"/><br />Alex</a></td>
   <td align="center"><a href="https://opensource.gubanov.eu/?ref=middleapi&amp;utm_source=middleapi&amp;utm_medium=sponsor" target="_blank" rel="noopener sponsored" title="Andrey Gubanov"><img src="https://avatars.githubusercontent.com/u/1082083?u=c5f2daf7ebece498e85c83367bb37b4e10e2649d&amp;v=4" width="119" alt="Andrey Gubanov"/><br />Andrey Gubanov</a></td>
  </tr>
</table>

With thanks to [39 past sponsors](https://orpc.dev/sponsors#past-sponsors) who helped get oRPC here.

## References

oRPC is inspired by existing solutions that prioritize type safety and developer experience. Special acknowledgments to:

- [tRPC](https://trpc.io): For pioneering the concept of end-to-end type-safe RPC and influencing the development of type-safe APIs.
- [ts-rest](https://ts-rest.com): For its emphasis on contract-first development and OpenAPI integration, which have greatly inspired oRPC's feature set.

## License

Distributed under the MIT License. See [LICENSE](https://github.com/middleapi/orpc/blob/main/LICENSE) for more information.
