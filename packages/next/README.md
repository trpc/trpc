<p align="center">
  <a href="https://trpc.io/"><img src="https://trpc.io/img/logo.svg" alt="tRPC" height="75"/></a>
</p>

<h3 align="center">tRPC</h3>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/v10-dark-landscape.gif" alt="Demo" />
</p>

# `@trpc/next`

> Connect a tRPC router to Next.js.

## Documentation

Full documentation for tRPC with Next.js can be found [here](https://trpc.io/docs/client/nextjs).

## Deprecated: `createTRPCNext` and `withTRPC`

`createTRPCNext`, `withTRPC` and `ssr: true` (with `@trpc/next/ssrPrepass`) are built on `@trpc/react-query`, which only gets bug fixes and will be removed in the next major version of tRPC. For both the App Router and the Pages Router, use [`@trpc/tanstack-react-query`](https://trpc.io/docs/client/tanstack-react-query) instead:

- [Set up with the App Router](https://trpc.io/docs/client/nextjs/app-router-setup)
- [Set up with the Pages Router](https://trpc.io/docs/client/nextjs/pages-router/setup), and [move from `createTRPCNext`](https://trpc.io/docs/client/nextjs/pages-router/setup#moving-from-createtrpcnext)

The experimental App Router helpers in `@trpc/next/app-dir/*` aren't deprecated.
