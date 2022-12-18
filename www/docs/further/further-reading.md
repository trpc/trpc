---
id: further-reading
title: Further Reading
sidebar_label: Further Reading
slug: /further-reading
---

## Who is this for?

- tRPC is for full-stack typescripters. It makes it dead easy to write "endpoints", which you can safely use in your app.
- It's designed for monorepos, as you need to export/import the type definitions from/to your server.
- If you already work in a team where languages are mixed or have third-party consumers over whom you have no control, you should create a language-agnostic [GraphQL](https://graphql.org/)-API.

## Relationship to GraphQL

If you already have a custom GraphQL-server for your project, you may not want to use tRPC. GraphQL is amazing; it's great to be able to make a flexible API where each consumer can pick just the data they need.

The thing is, GraphQL isn't that easy to get right - [ACL](https://en.wikipedia.org/wiki/Access-control_list) is needed to be solved on a per-type basis, complexity analysis, and performance are all non-trivial things.

We've taken a lot of inspiration from GraphQL. If you've previously built GraphQL servers, you'll be familiar with the concepts of input types and resolvers.

tRPC is a lot simpler and couples your server & website/app more tightly together (for good and for bad). It allows you to move quickly, make changes without having to update a schema, and avoid thinking about the ever-traversable graph.

<!---

## Differences to [Blitz.js](https://blitzjs.com/)

> I've gotten asked several times about differences with Blitz.js and started outlining some differences [on Twitter](https://twitter.com/alexdotjs/status/1436654002477969411). If you think the below comparison is wrong in any way, please don't hesitate to reach&nbsp;out.
> &mdash; [Alex&nbsp;/&nbsp;KATT](https://twitter.com/alexdotjs)

The philosophy of the _"Zero-API data layer"_ is the main common denominator in tRPC & Blitz.

Blitz is a full-stack framework & achieves this by maintaining a fork of Next.js and adding it into core - resulting in a more integrated developer experience. tRPC is a set of libraries that mainly focuses on the API-layer that can be used with any app or framework, resulting in no framework lock-in of React or Blitz's fork of Next.js.


### Benefits with tRPC

- Easy HTTP caching of queries as requests are made with `GET` rather than `POST` _(Blitz is planning on adding support for this too)_
- Query batching out-of-the-box
- Works great with React Native
- Well-tested & production-ready
- Not tied to React or Blitz's fork of Next.js
- Can be added to existing brownfield projects and adopted incrementally, regardless of stack
- WebSockets transport
- Subscription support
- Zero-conf SSR with `ssr: true` in `_app.tsx` does a prepass of all `useQuery` on the server
- Configurable data flow between client/server with links
- Single API-endpoint which reduces amounts of cold starts in serverless environments


### Benefits with Blitz.js

- Data layer integrated with the Next.js runtime, resulting in a more integrated experience
- Automatic integration with Blitz's auth
- Since you import server functions directly to the frontend, you can do things like CMD+click a function to jump to definition

### Potential Collaboration between Blitz and tRPC

Toward the end of 2021, Blitz creator Brandon Bayer announced a major pivot to a [framework agnostic toolkit](https://github.com/blitz-js/blitz/discussions/3075). This lead to a proposal from Alex on [ways for Blitz and tRPC to collaborate](https://github.com/blitz-js/blitz/discussions/3075#discussioncomment-1840918). Discussions around a potential integration with tRPC for the next iteration of Blitz has continued in [[RFC] New Blitz Toolkit Standalone Zero API Data Layer](https://github.com/blitz-js/blitz/discussions/3083).

-->
