---
id: further-reading
title: Further Reading
sidebar_label: Further Reading
slug: /further-reading
---



## Who is this for?

- tRPC is for full-stack javascripters. It makes it dead easy to write "endpoints" which you safely use in your app.
- It's designed for monorepos as you need to export/import the type definitions from/to your server
- If you're already in a team where you're mixing languages or have third party consumers that you have no control of, you're better off with making a [GraphQL](https://graphql.org/)-API which is language-agnostic.

## Relationship to GraphQL

If you are already have a custom GraphQL-server for your project you may not want to use tRPC. GraphQL is amazing; it's great to be able to make a flexible API where each consumer can pick just the data needed for it. 

The thing is, GraphQL isn't that easy to get right - ACL is needed to be solved on a per-type basis, complexity analysis, and performance are all non-trivial things.

We've taken a lot of inspiration from GraphQL & if you've made GraphQL-servers before you'll be familiar with the concept of input types and resolvers.

tRPC is a lot simpler and couples your server & website/app more tightly together (for good and for bad). It makes it easy to move quickly, do changes without updating a schema & there's no of thinking about the ever-traversable graph.

## Alternative projects

- [Blitz.js](https://blitzjs.com) is a full-stack framework. tRPC is just the data layer, but the philosophy of their _"Zero-API data layer"_ is very close to tRPC, but tRPC doesn't require a build pipeline nor is it tied to Next.js or even React.
- ...
