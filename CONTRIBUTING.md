# Contributing

So excited to have you here! If you want **any** guidance whatsoever with contributing to tRPC, don't hesitate to reach out on [Discord](https://trpc.io/discord)!

## Development workflow

We use [pnpm](https://pnpm.io) as our package manager, so make sure to [install](https://pnpm.io/installation) it first.

```bash
git clone git@github.com:trpc/trpc.git
cd trpc
pnpm install
pnpm build
```

### Get it running

**Terminal 1:**

```bash
# in project root directory
pnpm dev
```

This will start a watcher in parallel which builds all `packages/*` on any file change.

**Terminal 2:**

In another terminal, you can for instance navigate to `examples/next-prisma-starter` and run `pnpm dev` & it will update whenever code is changed in the packages.

### Testing

Open one terminal and run:

```bash
pnpm dev
```

In a second terminal, you can run the tests in watch mode using

```bash
pnpm test-watch

# example if you want to test a specific test file:
pnpm test-watch react

# run only a regression test while fixing a bug
pnpm test-watch 3085
```

Test are mainly coalesced in [./packages/tests](./packages/tests); we import the different libs from here, this makes it easier for us to do integration testing.

### Linting

```bash
pnpm lint-fix
```

### Troubleshooting

If you get any cryptic errors you can usually get past them by doing `pnpm clean && pnpm install`; if this doesn't work, feel free to open an issue.

### Contributing to the documentation

See [`/www/README.md`](./www/README.md) for the documentation on how to contribute to the website.

## Project overview

This project is a monorepo of packages with well-defined purposes. All of the following are packages are located in the [packages/\*](packages/) directory.

### `@trpc/server`

This package contains the core and server-side functionality. If something is shared between the client and server, it should be here.

#### Building a Router

This is where tRPC has the most interaction with users, so it should be treated with a great deal of importance. We care about offering a simple, intuitive API in which the HTTP layer disappears for the user. Here the user's entrypoint is [`initTRPC`](packages/server/src/core/initTRPC.ts) where root configuration such as a [data transformer](https://trpc.io/docs/data-transformers) is set and factory functions for router, procedure, middleware, etc. creation are returned.

The most complex types are also in this area because we must keep track of the context, meta, middleware, and each procedure and its inputs and outputs. If you are ever struggling to understand a type, feel free to ask for help on [Discord](https://trpc.io/discord).

#### Handling a Request and Forming a Response

The core implementation for HTTP handling is contained in [`resolveResponse`](packages/server/src/http/resolveHTTPResponse.ts) where [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request)s are handled and a [`Response`-object](https://developer.mozilla.org/en-US/docs/Web/API/Response) is created. This function deals with handling different methods (`query` and `mutation` have different specs), batching, streaming, etc. so it is an excellent place to get an overview of the complete process of handling a request and forming a response. If you want to learn more about the specification that we implement, read [this docs page](https://trpc.io/docs/rpc).

#### Adapting Requests and Responses

Adapters are what connect our framework-agnostic HTTP handling into a server response. We offer official adapters for some popular frameworks, although adapters can also be third-party. Adapters "adapt" their framework's request object into a common format and the object response from `resolveResponse` into their framework-specific responses. This keeps tRPC framework-agnostic, an important principle that allows it to be used in any environment.

### `@trpc/client`

This is where we use the router types to build a typesafe _vanilla_ client that makes requests to a tRPC API. Client packages (`@trpc/client`, `@trpc/react-query`) infer types from the server using the `Router` generic. In this package, users pass it to `createTRPCClient`.

#### Proxy API

In our client packages, we use [proxies](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Proxy) to offer the most intuitive API for users. They simply type the path of the procedure that they created in their `Router` and it is called as transparently as a regular function, enabling TypeScript features like jump to definition and easy refactors.

#### Links

The client is extensible via a "link" architecture. Links handle the parts of a request's lifecycle and hook into them using our observable implementation. By default, we make fetch requests using `httpBatchLink`, but we offer other useful official links, such as one for WebSockets, and links can also be third-party.

### `@trpc/react-query`

Here we build on top of React Query, using `@trpc/client` to create fetchers. Working similarly to `@trpc/client`, we wrap all React Query functions to make them typesafe, inferring them from the `Router` generic that users pass to `createReactQueryHooks`. Additionally, it includes some functionality needed for SSR.

We also use proxies here to provide a similar API to `@trpc/client`.

#### React Query vs. tRPC Domain

Sometimes it can be confusing to determine if an issue or feature is React Query or tRPC's responsibility. React Query is the library that tRPC builds on top of to gain features like query caching in a way that is familiar to many users. tRPC can be thought of as nothing more than a light wrapper over it, only changing it by adding types for the user's tRPC API and automatically providing a key and fetcher. However this does get more complicated if you factor in SSR.

### `@trpc/next`

This is where SSR magic for Next.js happens. If SSR is enabled in the config, all `@trpc/react-query` queries are fetched on the server using a prepass render of the component tree. We wrap [`getInitialProps`](https://nextjs.org/docs/api-reference/data-fetching/get-initial-props) to hook into the response process and perform a prepass render of the app. This package is subject to change in the future as Next.js improves their page and routing system.
