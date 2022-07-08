<p align="center">
  <a href="https://trpc.io/"><img src="../../www/static/img/logo-text.svg" alt="tRPC" height="130"/></a>
</p>

<p align="center">
  <strong>End-to-end typesafe APIs made easy</strong>
</p>

<p align="center">
  <!-- TODO: replace with new version GIF -->
  <img src="https://storage.googleapis.com/trpc/trpcgif.gif" alt="Demo" />
</p>

# `@trpc/server`

> The `@trpc/server` package is responsible for creating trpc APIs on the server.

## Installation

```bash
# NPM
npm install @trpc/server

# Yarn
yarn add @trpc/server

# Pnpm
pnpm install @trpc/server
```

We also recommend installing `zod` to validate procedure inputs.

## Basic Example

```typescript
import { initTRPC, inferAsyncReturnType } from '@trpc/server';
import {
  CreateHTTPContextOptions,
  createHTTPServer,
} from '@trpc/server/adapters/standalone';
import { z } from 'zod';

// Initialize a context for the server
function createContext(
  opts: CreateHTTPContextOptions,
) {
  return {};
}

// Get the context type
type Context = inferAsyncReturnType<typeof createContext>;

// Initialize trpc
const t = initTRPC<{ ctx: Context }>()();

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

// Exporting the app router type to be importing on the client side.
export type AppRouter = typeof appRouter;

// Create HTTP server
const { listen } = createHTTPServer({
  router: appRouter,
  createContext,
});

// Listen on port 2022
listen(2022);
```

## Documentation

Full documentation for `@trpc/server` can be found [here](https://trpc.io/docs/router)
