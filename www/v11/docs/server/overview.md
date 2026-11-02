---
id: overview
title: Backend Usage
sidebar_label: Overview
slug: /server/overview
section: "Backend Usage"
order: 5
skill:
  name: server-setup
  package: "@trpc/server"
  type: core
  description: Initialize tRPC with initTRPC.create(), define routers with
    t.router(), create procedures with .query()/.mutation()/.subscription(),
    configure context with createContext(), export AppRouter type, merge routers
    with t.mergeRouters(), lazy-load routers with lazy().
---

This section covers everything you need to set up and configure your tRPC backend. You'll learn how to define [routers](/docs/server/routers) and [procedures](/docs/server/procedures), set up [context](/docs/server/context), add [input validation](/docs/server/validators), and use [middlewares](/docs/server/middlewares) to extend your API.

Once your API is defined, you can host it using one of the available [adapters](/docs/server/adapters) for platforms like Express, Fastify, Next.js, AWS Lambda, and more.
