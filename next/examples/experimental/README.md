# Experimental examples

Examples of `experimental_*` APIs and of packages whose docs are still hidden. They follow the [examples layout](../README.md), except the TanStack Start apps, which keep Start's; `pnpm example` runs them with the rest. Any of them may change or go when the APIs do.

- [`openapi`](./openapi/README.md): one router over RPC and REST, a document generated from its types, and `experimental_openApiLink`.
- [`durable-jobs`](./durable-jobs/README.md): `experimental_durable()`, `experimental_durableLink()` and `experimental_lock()` on Redis, across two servers.
- [`worker-threads`](./worker-threads/README.md): a server in a Node worker thread, called with `experimental_messagePortLink`.
- [`nest`](./nest/README.md): a contract implemented in a Nest controller with `@trpc12/nest`, called with `experimental_openApiLink`.
- [`react-suspense`](./react-suspense/README.md): `@trpc12/experimental-react` (`use()` and Suspense, no TanStack Query) on TanStack Start, server-rendered and hydrated.
- [`react-atom`](./react-atom/README.md): the same page with `@trpc12/experimental-react-atom` (Effect atoms) on TanStack Start.
- [`framework-matrix`](./framework-matrix/README.md): one poll on Vue, Solid and Svelte pages with the TanStack Query adapters.
