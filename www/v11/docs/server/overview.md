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
  description: Set up a tRPC server. Initialize tRPC once with
    initTRPC.context<Context>().create(), define routers with t.router() and
    procedures with .query()/.mutation(), build reusable base procedures such as
    publicProcedure and authedProcedure, type and create the request context with
    createContext() (inner/outer context for tests and server-side calls), export
    the AppRouter type, nest child routers or merge them with t.mergeRouters(),
    lazy-load routers with lazy().
  include:
    - server/routers#initialize-trpc
    - server/routers#defining-a-router
    - server/routers#inline-sub-router
    - server/procedures#writing-procedures
    - server/procedures#reusable-base-procedures
    - server/context#defining-the-context-type
    - server/context#creating-the-context
    - server/context#inner-and-outer-context
    - server/merging-routers#merging-with-child-routers
    - server/merging-routers#lazy-load
  references:
    - server/routers
    - server/procedures
    - server/context
    - server/merging-routers
    - server/metadata
---

This section covers everything you need to set up and configure your tRPC backend. You'll learn how to define [routers](/docs/server/routers) and [procedures](/docs/server/procedures), set up [context](/docs/server/context), add [input validation](/docs/server/validators), and use [middlewares](/docs/server/middlewares) to extend your API.

Once your API is defined, you can host it using one of the available [adapters](/docs/server/adapters) for platforms like Express, Fastify, Next.js, AWS Lambda, and more.
