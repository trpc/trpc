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

The thing is, GraphQL isn't that easy to get right - [ACL](https://en.wikipedia.org/wiki/Access-control_list) needs to be solved on a per-type basis, complexity analysis, and performance are all non-trivial things.

We've taken a lot of inspiration from GraphQL. If you've previously built GraphQL servers, you'll be familiar with the concepts of input types and resolvers.

tRPC is a lot simpler and couples your server & website/app more tightly together (for good and for bad). It allows you to move quickly, make changes without having to update a schema, and avoid thinking about the ever-traversable graph.
