---
id: edge-runtimes
title: Usage with edge runtimes
sidebar_label: Usage with edge runtimes
slug: /edge-runtimes
---

You can create a tRPC server within any edge runtime that follow the [WinterCG](https://wintercg.org/), specifically the [Minimum Common Web Platform API](https://common-min-api.proposal.wintercg.org/) specification.

Some of these runtimes includes, but not limited to:

- Cloudflare Workers
- Deno Deploy
- Vercel Edge Runtime

## How to use tRPC server with an edge runtime

tRPC provides a [fetch adapter](/docs/fetch) that uses the native [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) and [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response) APIs as input and output. The tRPC-specific code is the same accross all runtimes, the only difference being how the response is returned.

Follow the [fetch adapter](/docs/fetch) documentation to learn more.

## Required Web APIs

tRPC server uses the following Fetch APIs:

- `Request`, `Response`
- `fetch`
- `Headers`
- `URL`

If your runtime supports these APIs, you can [use tRPC server](#how-to-use-trpc-server-with-an-edge-runtime).

:::tip
Fun fact: that also means you can use tRPC server in your browser!
:::
