<p align="center">
  <a href="https://trpc.io/"><img src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg" alt="tRPC" height="75"/></a>
</p>

<h3 align="center">tRPC</h3>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <img src="https://assets.trpc.io/www/v10/v10-dark-landscape.gif" alt="Demo" />
</p>

# `@trpc/server`

> Create tRPC routers and connect them to a server.

## Documentation

Full documentation for `@trpc/server` can be found [here](https://trpc.io/docs/router)

## Installation

```bash
# npm
npm install @trpc/server

# Yarn
yarn add @trpc/server

# pnpm
pnpm add @trpc/server

# Bun
bun add @trpc/server
```

We also recommend installing `zod` to validate procedure inputs.

## Basic Example

```ts
import { inferAsyncReturnType, initTRPC } from '@trpc/server';
import {
  CreateHTTPContextOptions,
  createHTTPServer,
} from '@trpc/server/adapters/standalone';
import { z } from 'zod';

// Initialize a context for the server
function createContext(opts: CreateHTTPContextOptions) {
  return {};
}

// Get the context type
type Context = inferAsyncReturnType<typeof createContext>;

// Initialize tRPC
const t = initTRPC.context<Context>().create();

// Create main router
const appRouter = t.router({
  // Greeting procedure
  greeting: t.procedure
    .input(
      z.object({
        name: z.string(),
      }),
    )
    .query(({ input }) => `Hello, ${input.name}!`),
});

// Export the app router type to be imported on the client side
export type AppRouter = typeof appRouter;

// Create HTTP server
const { listen } = createHTTPServer({
  router: appRouter,
  createContext,
});

// Listen on port 2022
listen(2022);
```
