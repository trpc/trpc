---
id: overview
title: Client Overview
sidebar_label: Overview
slug: /client
section: "Client Usage"
order: 29
---

While a tRPC API can be called using normal HTTP requests like any other REST API, you will need a **client** to benefit from tRPC's typesafety.

A client knows the procedures that are available in your API, and their inputs and outputs. It uses this information to give you autocomplete on your queries and mutations, correctly type the returned data, and show errors if you are writing requests that don't match the shape of your backend.

If you are using React, the recommended way to call a tRPC API is by using our [TanStack React Query Integration](./client/tanstack-react-query/setup.md), which in addition to typesafe API calls also offers caching, invalidation, and management of loading and error state. If you are using Next.js, follow the [Next.js App Router setup](./client/nextjs/app-router-setup.md), which uses the TanStack React Query integration. The Pages Router integration (`@trpc/next`) is deprecated in favor of the TanStack React Query integration.

If you want to call a tRPC API from another server or from a frontend framework for which we don't have an integration, you can use the [Vanilla Client](./client/vanilla.md).

In addition to the React and Next.js integrations and the Vanilla Client, there are a variety of [community-built integrations for other frameworks](/docs/community/awesome-trpc#frontend-frameworks). Please note that these are not maintained by the tRPC team.
